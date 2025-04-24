import os
import logging
import argparse
import json
import uuid
from typing import Dict, Any, List, Optional, Union
import datetime
import sys
import time
import asyncio

import psycopg2
import numpy as np
from langchain.schema.document import Document
from langchain.schema.retriever import BaseRetriever
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough, RunnableParallel, RunnableLambda
from langchain_google_vertexai import VertexAIEmbeddings, VertexAI
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load common embedding models from embed_text
try:
    # Assumes embed_text is in the same parent directory (processing)
    from processing.embed_text.main import EMBEDDING_MODELS, get_embedding_model
except ImportError as e:
    logger.warning(f"Could not import shared embedding functions: {e}. Defining defaults.")
    # Define basic embedding models if import fails (fallback)
    EMBEDDING_MODELS = {
        "text-multilingual-embedding-002": {
            "class": VertexAIEmbeddings,
            "params": {"model_name": "text-multilingual-embedding-002"}
        }
        # Add other necessary Vertex AI models if needed
    }
    
    def get_embedding_model(model_name: str):
        """Basic fallback embedding model loader."""
        if model_name not in EMBEDDING_MODELS:
            raise ValueError(f"Unsupported embedding model: {model_name}")
        model_config = EMBEDDING_MODELS[model_name]
        return model_config["class"](**model_config["params"])

# Custom retriever for PostgreSQL/pgvector database
class PgVectorRetriever(BaseRetriever, BaseModel):
    """Retriever for PostgreSQL with pgvector."""
    
    connection_string: str = Field(..., description="Database connection string")
    embedding_model_name: str = Field(..., description="Name of the embedding model to use")
    workspace_id: str = Field(..., description="Workspace ID to query against")
    table_prefix: str = Field("", description="Optional prefix for database tables")
    search_type: str = Field("cosine", description="Vector search type (cosine, l2, inner)")
    top_k: int = Field(4, description="Number of documents to retrieve")
    
    # Private attributes (not fields)
    _embedding_model = None
    
    @property
    def embedding_model(self):
        """Lazy load the embedding model."""
        if self._embedding_model is None:
            logger.info(f"Loading embedding model for retriever: {self.embedding_model_name}")
            self._embedding_model = get_embedding_model(self.embedding_model_name)
        return self._embedding_model
    
    def get_relevant_documents(self, query: str) -> List[Document]:
        """Retrieve documents relevant to the query."""
        conn = None
        try:
            # Generate embedding for query
            query_embedding = self.embedding_model.embed_query(query)
            
            # Connect to database
            conn = psycopg2.connect(self.connection_string)
            
            documents_table = f"{self.table_prefix}documents"
            chunks_table = f"{self.table_prefix}chunks"
            
            # Determine search operator based on search type
            if self.search_type == "cosine":
                operator = "<=>" # Cosine distance in pgvector 0.5+ (use <-> for older)
            elif self.search_type == "l2":
                operator = "<->"  # L2 distance
            elif self.search_type == "inner":
                operator = "<#>"  # Inner product
            else:
                raise ValueError(f"Unsupported search type: {self.search_type}")
            
            with conn.cursor() as cur:
                # Query for similar vectors - directly from chunks table
                query_sql = f"""
                    SELECT 
                        c.chunk_text,
                        d.metadata as document_metadata,
                        d.filename,
                        c.chunk_index,
                        c.page_number,
                        c.embedding {operator} %s::vector as similarity
                    FROM 
                        {chunks_table} c
                    JOIN 
                        {documents_table} d ON c.doc_id = d.doc_id
                    WHERE 
                        d.workspace_id = %s
                    ORDER BY 
                        similarity ASC -- ASC for distance, DESC for inner product
                    LIMIT %s;
                """
                # Adjust ORDER BY for inner product
                if self.search_type == "inner":
                     query_sql = query_sql.replace("ASC", "DESC", 1)
                
                # Convert embedding list to string format for query
                query_embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"
                
                cur.execute(query_sql, (query_embedding_str, self.workspace_id, self.top_k))
                results = cur.fetchall()
                
                # Create Document objects
                documents = []
                for row in results:
                    chunk_text, doc_meta_json, file_name, chunk_index, page_number, similarity = row
                    
                    # Parse JSON metadata safely
                    doc_meta = {}
                    try:
                        if doc_meta_json:
                            # Check if doc_meta_json is already a dict or needs parsing
                            if isinstance(doc_meta_json, dict):
                                doc_meta = doc_meta_json
                            else:
                                doc_meta = json.loads(doc_meta_json)
                    except json.JSONDecodeError:
                        logger.warning(f"Could not parse document metadata: {doc_meta_json}")
                    
                    # Combine metadata
                    metadata = {
                        "file_name": file_name,
                        "similarity": float(similarity), # Ensure float
                        "chunk_index": chunk_index,
                        "page_number": page_number,
                        "document_info": doc_meta # Nest document info
                    }
                    
                    documents.append(Document(page_content=chunk_text, metadata=metadata))
                
                logger.info(f"Retrieved {len(documents)} documents for query: '{query[:50]}...'")
                return documents
        
        except Exception as e:
            logger.error(f"Error retrieving documents: {str(e)}", exc_info=True)
            # Reraise or return empty list depending on desired behavior
            return [] # Return empty list on error
        finally:
             if conn:
                 conn.close()

    def get_page_content(self, workspace_id, max_chunks=300):
        """Retrieve all document chunks for a workspace."""
        documents_table = f"{self.table_prefix}documents"
        chunks_table = f"{self.table_prefix}chunks"

def get_llm(model_name: Optional[str] = None, temperature: float = 0.6, streaming: bool = False):
    """Get a Vertex AI language model, optionally configured for streaming."""
    env_model_name = os.getenv("VERTEXAI_MODEL_NAME")
    fallback_model_name = "gemini-2.0-flash" # Changed fallback to a generally available model
    
    if model_name:
        effective_model_name = model_name
        source = "API request"
    elif env_model_name:
        effective_model_name = env_model_name
        source = "VERTEXAI_MODEL_NAME environment variable"
    else:
        effective_model_name = fallback_model_name
        source = "hardcoded fallback"
        logger.warning(f"VERTEXAI_MODEL_NAME not set, falling back to {fallback_model_name}")

    logger.info(f"Using Vertex AI model: {effective_model_name} (Source: {source}, Streaming: {streaming}, Temp: {temperature})")
    
    try:
        return VertexAI(model_name=effective_model_name, temperature=temperature, streaming=streaming)
    except Exception as e:
         logger.error(f"Failed to initialize Vertex AI model '{effective_model_name}': {e}", exc_info=True)
         # Optional: try the ultimate fallback if the selected one failed?
         if effective_model_name != fallback_model_name:
              logger.warning(f"Attempting to use fallback model {fallback_model_name} due to error.")
              try:
                   return VertexAI(model_name=fallback_model_name, temperature=temperature, streaming=streaming)
              except Exception as fallback_e:
                   logger.error(f"Fallback model {fallback_model_name} also failed: {fallback_e}", exc_info=True)
                   raise fallback_e # Re-raise the error from the fallback
         raise e # Re-raise the original error if it was already the fallback

def format_docs(docs: List[Document]) -> str:
    """Helper function to format retrieved documents for the prompt."""
    if not docs:
        return "No relevant documents were found for this query."
    
    formatted_docs = []
    for i, doc in enumerate(docs):
        # Extract metadata
        source = doc.metadata.get("file_name", "Unknown Source")
        chunk_index = doc.metadata.get("chunk_index", "?")
        similarity = doc.metadata.get("similarity", 0.0)
        # Calculate relevance percentage (assuming lower distance is better for cosine/L2)
        relevance_percentage = f"{(1.0 - similarity) * 100:.1f}%" if similarity <= 1.0 else "N/A"
        # Handle inner product similarity (higher is better)
        if doc.metadata.get("search_type", "cosine") == "inner": 
            # Need a baseline or normalization for inner product relevance percentage
            relevance_percentage = f"{similarity:.2f} (Inner Prod)" # Placeholder

        # Format document with metadata
        formatted_doc = f"DOCUMENT {i+1}:\n"
        formatted_doc += f"Source: {source} (Chunk {chunk_index}, Relevance: {relevance_percentage})\n"
        formatted_doc += f"Content:\n{doc.page_content}\n"
        
        formatted_docs.append(formatted_doc)
    
    return "\n\n".join(formatted_docs)

# --- Format Chat History Function ---
def format_chat_history(chat_history: List[Dict[str, any]]) -> str:
    """Formats chat history into a simple string."""
    if not chat_history:
        return "No previous conversation history."
    # Format assuming roles 'user' and 'model'
    return "\n".join([f"{msg['role'].upper()}: {msg['parts'][0]['text']}" for msg in chat_history])

async def create_streaming_query_chain(
    retriever: BaseRetriever,
    model_name: Optional[str] = None,
    temperature: float = 0.2,
    chat_history: Optional[List[Dict[str, Any]]] = None
):
    """Create a query processing chain designed for streaming output."""
    # Get the LLM configured for streaming
    llm = get_llm(model_name=model_name, temperature=temperature, streaming=True)
    
    template = """You are a helpful AI assistant for a RAG (Retrieval-Augmented Generation) system.
Your goal is to answer the user's latest question based on the provided context documents AND the preceding conversation history.

CONVERSATION HISTORY:
{chat_history_str}

RETRIEVED DOCUMENTS (Context):
{context}

USER QUESTION:
{question}

INSTRUCTIONS:
1.  Carefully review the CONVERSATION HISTORY to understand the context of the USER QUESTION.
2.  Use the RETRIEVED DOCUMENTS as the primary source of information to answer the USER QUESTION.
3.  If the documents contain relevant information, synthesize it with the conversation history to provide a complete and relevant answer.
4.  If the documents don't contain enough information, explain what you can based on the available context AND conversation history.
5.  If neither the documents nor the history provide relevant information, politely state that you cannot answer the question based on the provided information.
6.  Keep your answer concise and directly related to the USER QUESTION.

ANSWER:"""
    prompt = ChatPromptTemplate.from_template(template)

    # Prepare inputs for the prompt
    inputs = RunnableParallel(
        context=(lambda x: retriever.get_relevant_documents(x["question"])) | RunnableLambda(format_docs),
        question=lambda x: x["question"],
        chat_history_str=lambda x: format_chat_history(x.get("chat_history", []))
    )
    
    # Build the chain: inputs -> prompt -> llm (streaming)
    # Note: We don't use StrOutputParser here as we want the stream of chunks
    chain = inputs | prompt | llm
    
    return chain

async def process_query_stream(
    query: str,
    workspace_id: str,
    connection_string: str,
    embedding_model_name: str = "text-multilingual-embedding-002",
    model_name: str = "gemini-1.5-flash-preview-0514",
    table_prefix: str = "",
    search_type: str = "cosine",
    top_k: int = 4,
    temperature: float = 0.2,
    chat_history: Optional[List[Dict[str, Any]]] = None
):
    """Processes a query and yields response chunks asynchronously."""
    start_time = time.time()
    try:
        retriever = PgVectorRetriever(
            connection_string=connection_string,
            embedding_model_name=embedding_model_name,
            workspace_id=workspace_id,
            table_prefix=table_prefix,
            search_type=search_type,
            top_k=top_k
        )
        
        chain = await create_streaming_query_chain(retriever, model_name, temperature, chat_history)
        
        logger.info(f"Streaming query for workspace {workspace_id} (model: {model_name}, temp: {temperature})...")
        
        # Prepare input dictionary for the chain
        chain_input = {"question": query, "chat_history": chat_history or []}
        
        async for chunk in chain.astream(chain_input):
            # Assuming the chunk is directly the string output from the LLM
            if isinstance(chunk, str):
                yield chunk
            else:
                # Handle potential other types of chunks if necessary (e.g., AIMessageChunk)
                content = getattr(chunk, 'content', None)
                if content and isinstance(content, str):
                    yield content
                else:
                     logger.warning(f"Received unexpected chunk type: {type(chunk)}")

        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Query stream finished in {processing_time_ms} ms.")

    except Exception as e:
        logger.error(f"Error during query streaming: {str(e)}", exc_info=True)
        # Yield an error message chunk
        yield f"Error: Query processing failed - {str(e)}"

# Keep the original non-streaming function for potential other uses or testing
def process_query(
    query: str,
    workspace_id: str,
    connection_string: str,
    embedding_model_name: str = "text-multilingual-embedding-002",
    model_name: str = "gemini-1.5-flash-preview-0514", # Updated default
    table_prefix: str = "",
    search_type: str = "cosine",
    top_k: int = 4,
    temperature: float = 0.2,
    chat_history: Optional[List[Dict[str, Any]]] = None # Add chat_history parameter
) -> Dict[str, Any]:
    """Process a query using the RAG approach with Vertex AI, including chat history (non-streaming)."""
    # This function remains largely the same, but uses a non-streaming LLM call
    # and StrOutputParser in its chain if needed for non-streaming use cases.
    # For now, let's simplify and assume the streaming endpoint is the primary one.
    # If you need a non-streaming version, this logic should be adjusted.
    logger.warning("Non-streaming process_query called. Consider using process_query_stream for API.")
    # Fallback or placeholder implementation for non-streaming:
    # Re-implement the chain creation without streaming and with StrOutputParser if needed.
    # For now, just return a placeholder error or adapt based on actual needs.
    return {"error": "Non-streaming query processing not fully implemented, use streaming endpoint."}

def main():
    """Command-line interface for query processing using Vertex AI."""
    parser = argparse.ArgumentParser(description='Process queries using RAG against a PostgreSQL/pgvector backend with Vertex AI.')
    parser.add_argument('-q', '--query', required=True, help='Query text to process.')
    parser.add_argument('-w', '--workspace-id', required=True, help='UUID of the target workspace.')
    parser.add_argument('--embedding-model', default='text-multilingual-embedding-002', 
                        help='Vertex AI Embedding model used for retrieval (default: text-multilingual-embedding-002).')
    parser.add_argument('--model-name', default="gemini-1.5-flash-preview-0514",
                        help='Specific Vertex AI LLM model name.')
    parser.add_argument('--connection-string', help='Database connection string (overrides env vars).')
    parser.add_argument('--table-prefix', default='', help='Optional prefix for database tables.')
    parser.add_argument('--search-type', default='cosine', choices=['cosine', 'l2', 'inner'], 
                        help='Vector search type (default: cosine).')
    parser.add_argument('--top-k', type=int, default=4, help='Number of relevant documents to retrieve (default: 4).')
    parser.add_argument('--output', help='Output JSON file to save results (optional).')
    parser.add_argument('--env-file', help='Path to .env file for environment variables')
    parser.add_argument('--temperature', type=float, default=0.2, help='Temperature for LLM generation')

    args = parser.parse_args()

    # Load environment variables
    if args.env_file:
        load_dotenv(dotenv_path=args.env_file)
        logger.info(f"Loaded environment variables from {args.env_file}")
    
    try:
        # --- Determine Connection String --- 
        # Prioritize CLI arg, then env var DATABASE_URL, then construct from DB_* vars
        connection_string = args.connection_string # Get from CLI first
        if not connection_string:
            connection_string = os.getenv("DATABASE_URL")
            if not connection_string:
                 # Attempt construction (assuming LOCAL_DEV=true for CLI testing, adjust if needed)
                 db_user = os.getenv('DB_USER')
                 db_password = os.getenv('DB_PASSWORD')
                 db_host = os.getenv('DB_HOST', 'localhost') # Default to localhost for CLI convenience
                 db_port = os.getenv('DB_PORT', '5432')
                 db_name = os.getenv('DB_NAME')
                 if all([db_user, db_password, db_host, db_name]):
                     connection_string = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
                 else:
                      raise ValueError("Database connection string not provided via --connection-string or environment variables.")

        # --- Call the NON-STREAMING version for CLI --- 
        # We need to adjust create_query_chain or have a separate one for non-streaming
        # For now, let's demonstrate the principle but acknowledge it needs refinement
        logger.info("Running non-streaming query for CLI...")
        # result = process_query(...) # Call the original function if fully implemented
        
        # Temporary CLI result simulation using streaming and collecting
        async def run_sync():
            full_response = ""
            async for chunk in process_query_stream(
                 query=args.query,
                 workspace_id=args.workspace_id,
                 connection_string=connection_string, 
                 embedding_model_name=args.embedding_model,
                 model_name=args.model_name,
                 table_prefix=args.table_prefix,
                 search_type=args.search_type,
                 top_k=args.top_k,
                 temperature=args.temperature,
                 chat_history=[] # CLI doesn't easily support history
             ):
                 full_response += chunk
            # Structure the result similar to the original non-streaming version
            return {
                 "query": args.query,
                 "answer": full_response,
                 "workspace_id": args.workspace_id,
                 # Timing won't be accurate here
             }
        result = asyncio.run(run_sync())
        # --- End Temp Simulation --- 

        # Print result to console (formatted)
        print("--- Query Result ---")
        print(f"Query: {result.get('query')}")
        if "error" in result:
            print(f"Status: Error")
            print(f"Error Message: {result['error']}")
        else:
            print(f"Status: Success")
            print(f"Answer: {result.get('answer')}")
        print(f"Workspace: {result.get('workspace_id')}")
        print(f"Processing Time: {result.get('processing_time_ms')} ms")
        print("--------------------")

        # Save to output file if specified
        if args.output:
            create_directories_for_file(args.output) # Ensure dir exists
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved query result to {args.output}")
            
        return 0 if "answer" in result else 1

    except Exception as e:
        logger.error(f"An unexpected error occurred in main: {str(e)}", exc_info=True)
        return 1

def create_directories_for_file(file_path: str):
    """Helper to create directories for a file if they don't exist."""
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        logger.debug(f"Created directory for output file: {directory}")

if __name__ == "__main__":
    # Ensure the processing directory and parent are discoverable if running as main script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir) # processing directory
    grandparent_dir = os.path.dirname(parent_dir) # project root
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    if grandparent_dir not in sys.path:
        sys.path.insert(0, grandparent_dir)
        
    exit_code = main()
    sys.exit(exit_code) 