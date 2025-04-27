import os
import logging
import argparse
import json
import uuid
import sys  # Make sure sys is imported for sys.exit()
from typing import List, Dict, Any, Optional, Union
import datetime

import psycopg2
from psycopg2.extras import execute_batch
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_embedded_documents_from_json(file_path: str) -> List[Dict[str, Any]]:
    """
    Load embedded documents from a JSON file in the format produced by the embed_text module.
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Convert embedding lists back to numpy arrays if needed
        for doc in data:
            if isinstance(doc["embedding"], list):
                doc["embedding"] = np.array(doc["embedding"], dtype=np.float32)
        
        logger.info(f"Loaded {len(data)} embedded documents from {file_path}")
        return data
    
    except Exception as e:
        logger.error(f"Error loading embedded documents from {file_path}: {str(e)}")
        raise

def store_embedded_documents(
    embedded_documents: List[Dict[str, Any]],
    workspace_id: str,
    connection_string: str,
    document_metadata: Optional[Dict[str, Any]] = None,
    table_prefix: str = ""
):
    """
    Store embedded documents in the database.
    Connects using the provided connection string.
    Assumes tables exist with the following schema:
    - documents: doc_id, workspace_id, user_id, filename, gcs_path, status, uploaded_at, metadata
    - chunks: chunk_id, doc_id, chunk_text, embedding, chunk_index, page_number, created_at
    """
    if not embedded_documents:
        logger.warning("No embedded documents to store")
        return 0
    
    conn = None # Initialize connection variable
    try:
        # Establish connection within the function
        conn = psycopg2.connect(connection_string)
        logger.info(f"store_data: Connected to DB using provided string.")

        # Ensure pgvector extension is enabled (can keep this check)
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            conn.commit()

        # --- Get Table Names --- 
        documents_table = f"{table_prefix}documents"
        chunks_table = f"{table_prefix}chunks"
        
        # --- Group Documents --- 
        documents_by_source = {}
        for doc in embedded_documents:
            source = doc["metadata"].get("source", "unknown")
            if source not in documents_by_source:
                documents_by_source[source] = []
            documents_by_source[source].append(doc)

        # --- Database Operations --- 
        total_chunks = 0
        with conn.cursor() as cur:
            for source, chunks in documents_by_source.items():
                sample_chunk = chunks[0]
                file_name = sample_chunk["metadata"].get("filename", os.path.basename(source)) 
                user_id = document_metadata.get("uploaded_by") if document_metadata else sample_chunk["metadata"].get("uploaded_by", "") 
                # Determine the source path correctly - prefer metadata['source'] if available
                source_path = sample_chunk["metadata"].get("source", source) 
                
                # Prepare doc_meta 
                doc_meta = document_metadata or {}
                doc_meta.update({
                    "chunk_count": len(chunks),
                    "embedding_model": sample_chunk["metadata"].get("embedding_model", ""),
                    "chunking_method": sample_chunk["metadata"].get("chunking_method", ""),
                    "chunk_size": sample_chunk["metadata"].get("chunk_size", 0),
                    "chunk_overlap": sample_chunk["metadata"].get("chunk_overlap", 0)
                })
                
                # --- Insert Document --- 
                # First check if document with this path already exists
                cur.execute(f"""
                    SELECT doc_id FROM {documents_table}
                    WHERE gcs_path = %s AND workspace_id = %s;
                """, (source_path, workspace_id))
                existing_doc = cur.fetchone()
                
                if existing_doc:
                    # Document exists - update it instead of inserting
                    actual_doc_id = existing_doc[0]
                    cur.execute(f"""
                        UPDATE {documents_table}
                        SET metadata = %s, user_id = %s, filename = %s
                        WHERE doc_id = %s;
                    """, (json.dumps(doc_meta), user_id, file_name, actual_doc_id))
                    
                    # Delete existing chunks for this document
                    cur.execute(f"""
                        DELETE FROM {chunks_table}
                        WHERE doc_id = %s;
                    """, (actual_doc_id,))
                    
                    logger.info(f"Updated existing document {actual_doc_id} ('{file_name}') with source path: {source_path}")
                else:
                    # Document doesn't exist - insert new
                    cur.execute(f"""
                        INSERT INTO {documents_table}
                        (workspace_id, user_id, filename, gcs_path, metadata)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING doc_id;
                    """, (
                        workspace_id,
                        user_id,
                        file_name, 
                        source_path,  # use as gcs_path 
                        json.dumps(doc_meta)
                    ))
                    doc_id_result = cur.fetchone() 
                    if not doc_id_result:
                        logger.error(f"Failed to retrieve doc_id after inserting document for source: {source_path}")
                        continue # Skip chunks if document insertion failed
                    actual_doc_id = doc_id_result[0]
                    logger.info(f"Inserted new document {actual_doc_id} ('{file_name}') with source path: {source_path}")
                
                # --- Prepare Chunk Data --- 
                chunk_values = []
                for chunk in chunks:
                    embedding = chunk["embedding"]
                    if hasattr(embedding, "tolist"): # Convert numpy array if needed
                        embedding = embedding.tolist()
                        
                    # Generate UUID for chunk_id or use existing one
                    chunk_id_uuid = chunk["metadata"].get("chunk_id", uuid.uuid4())
                    
                    # Convert UUIDs to strings and prepare values matching the schema
                    chunk_values.append((
                        str(chunk_id_uuid),
                        str(actual_doc_id), 
                        chunk["text"],  # chunk_text
                        embedding,      # embedding vector
                        chunk["metadata"].get("chunk_index", 0),
                        chunk["metadata"].get("page_number", None),  # page_number can be NULL
                    ))

                # --- Insert Chunks --- 
                chunk_query = f"""
                    INSERT INTO {chunks_table}
                    (chunk_id, doc_id, chunk_text, embedding, chunk_index, page_number)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """
                logger.info(f"Inserting {len(chunk_values)} chunks for document {actual_doc_id}")
                execute_batch(cur, chunk_query, chunk_values)
                logger.info(f"Inserted {len(chunk_values)} chunks for document {actual_doc_id}")
                
                total_chunks += len(chunks)
            
            conn.commit() # Commit transaction
            logger.info(f"Successfully stored {total_chunks} embedded chunks from {len(documents_by_source)} source document(s)")
            return total_chunks
    
    except (Exception, psycopg2.DatabaseError) as e:
        logger.error(f"Error storing embedded documents: {str(e)}", exc_info=True)
        if conn: conn.rollback() # Rollback on error
        raise
    finally:
        if conn: conn.close() # Ensure connection is closed

def main():
    """Command-line interface for storing embedded documents"""
    parser = argparse.ArgumentParser(description='Store embedded documents in PostgreSQL')
    parser.add_argument('--input', required=True, help='Input JSON file with embedded documents')
    parser.add_argument('--workspace-id', required=True, help='The UUID of the workspace')
    parser.add_argument('--connection-string', required=True, help='Database connection string (must be provided)')
    parser.add_argument('--table-prefix', default='', help='Optional prefix for database tables')
    parser.add_argument('--metadata', help='Additional metadata for the parent document as JSON string')
    
    args = parser.parse_args()
    
    try:
        # Load the embedded documents
        embedded_docs = load_embedded_documents_from_json(args.input)
        if not embedded_docs:
             logger.warning("Input file contains no documents to process.")
             return 0
        
        # Parse additional metadata if provided
        document_metadata = None
        if args.metadata:
            try:
                document_metadata = json.loads(args.metadata)
            except json.JSONDecodeError as json_err:
                 logger.error(f"Invalid JSON provided for --metadata: {json_err}")
                 raise
        
        # Store the documents using the provided connection string
        num_stored = store_embedded_documents(
            embedded_documents=embedded_docs,
            workspace_id=args.workspace_id,
            connection_string=args.connection_string,
            document_metadata=document_metadata,
            table_prefix=args.table_prefix
        )
        
        logger.info(f"CLI: Successfully processed and stored {num_stored} chunks.")
        return num_stored
    
    except Exception as e:
        logger.error(f"Error in store_data CLI main execution: {str(e)}", exc_info=True)
        return None # Indicate error for CLI script

if __name__ == "__main__":
    if main() is None:
         sys.exit(1) # Exit with error code if main fails
    else:
         sys.exit(0)
