import os
import logging
import argparse
import json
from typing import List, Dict, Any, Optional, Union
import uuid
import datetime

from langchain.schema.document import Document
from langchain_google_vertexai import VertexAIEmbeddings

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mapping of embedding model names to their Langchain classes and configurations
# Focusing only on Vertex AI Embeddings
EMBEDDING_MODELS = {
    "textembedding-gecko@003": {
        "class": VertexAIEmbeddings,
        "params": {"model_name": "textembedding-gecko@003"}
    },
    "textembedding-gecko-multilingual@001": {
        "class": VertexAIEmbeddings,
        "params": {"model_name": "textembedding-gecko-multilingual@001"}
    },
    "text-multilingual-embedding-002": {
        "class": VertexAIEmbeddings,
        "params": {"model_name": "text-multilingual-embedding-002"}
    }
    # Add other Vertex AI embedding models here if needed
}

def load_documents_from_json(file_path: str) -> List[Document]:
    """
    Load documents from a JSON file in the format produced by the chunk_text module.
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        documents = []
        for item in data:
            doc = Document(
                page_content=item["text"],
                metadata=item.get("metadata", {})
            )
            documents.append(doc)
        
        logger.info(f"Loaded {len(documents)} documents from {file_path}")
        return documents
    
    except Exception as e:
        logger.error(f"Error loading documents from {file_path}: {str(e)}")
        raise

def get_embedding_model(model_name: str):
    """
    Get the specified Vertex AI embedding model.
    
    Args:
        model_name: Name of the Vertex AI embedding model to use.
    
    Returns:
        An instance of the VertexAIEmbeddings model.
    """
    if model_name not in EMBEDDING_MODELS:
        logger.error(f"Unsupported Vertex AI embedding model: {model_name}")
        raise ValueError(f"Unsupported Vertex AI embedding model: {model_name}. "
                         f"Supported models: {', '.join(EMBEDDING_MODELS.keys())}")
    
    try:
        model_config = EMBEDDING_MODELS[model_name]
        model_class = model_config["class"]
        model_params = model_config["params"]
        
        logger.info(f"Initializing Vertex AI embedding model: {model_name}")
        # Vertex AI models use Application Default Credentials (ADC)
        embedding_model = model_class(**model_params)
        logger.info(f"Successfully initialized Vertex AI embedding model: {model_name}")
        
        return embedding_model
    
    except Exception as e:
        logger.error(f"Error initializing Vertex AI embedding model {model_name}: {str(e)}", exc_info=True)
        raise

def embed_documents(
    documents: List[Document],
    model_name: str = "text-multilingual-embedding-002",
    batch_size: int = 250 # Default batch size suitable for Vertex AI gecko models
) -> List[Dict[str, Any]]:
    """
    Generate embeddings for a list of documents using Vertex AI.
    
    Args:
        documents: List of documents to embed.
        model_name: Name of the Vertex AI embedding model to use.
        batch_size: Number of documents to process in each batch (Vertex AI has limits).
    
    Returns:
        List of documents with embeddings.
    """
    try:
        # Get the embedding model
        embedding_model = get_embedding_model(model_name)
        
        # Extract the texts from the documents
        texts = [doc.page_content for doc in documents]
        
        # Process documents in batches
        all_embeddings = []
        # Use the specified batch size, respecting potential model limits (e.g., 250 for gecko)
        effective_batch_size = min(batch_size, 250) 
        logger.info(f"Using effective batch size of {effective_batch_size} for Vertex AI embedding")
        
        for i in range(0, len(texts), effective_batch_size):
            batch_texts = texts[i:i+effective_batch_size]
            logger.info(f"Embedding batch {i//effective_batch_size + 1}/{(len(texts) + effective_batch_size - 1) // effective_batch_size}")
            # VertexAIEmbeddings handles batching internally via embed_documents
            batch_embeddings = embedding_model.embed_documents(batch_texts)
            all_embeddings.extend(batch_embeddings)
        
        # Create embedding document objects with metadata and vectors
        embedded_documents = []
        for i, (doc, embedding) in enumerate(zip(documents, all_embeddings)):
            # Create a copy of the original metadata
            metadata = dict(doc.metadata)
            
            # Add embedding metadata
            metadata.update({
                "embedding_model": model_name,
                "vector_id": str(uuid.uuid4()),  # Generate a unique ID for this vector
                "embedding_timestamp": str(datetime.datetime.now(datetime.timezone.utc).isoformat())
            })
            
            # Create the embedded document
            embedded_doc = {
                "text": doc.page_content,
                "metadata": metadata,
                "embedding": embedding # Embedding is already a list of floats
            }
            embedded_documents.append(embedded_doc)
        
        logger.info(f"Generated embeddings for {len(embedded_documents)} documents using {model_name}")
        return embedded_documents
    
    except Exception as e:
        logger.error(f"Error generating Vertex AI embeddings: {str(e)}", exc_info=True)
        raise

def main():
    """Command-line interface for document embedding using Vertex AI"""
    parser = argparse.ArgumentParser(description='Generate Vertex AI embeddings for text chunks')
    parser.add_argument('--input', required=True, help='Input JSON file with text chunks')
    parser.add_argument('--output', help='Output JSON file to save embeddings (optional)')
    parser.add_argument('--model', default='text-multilingual-embedding-002', 
                        choices=list(EMBEDDING_MODELS.keys()),
                        help='Vertex AI Embedding model to use')
    parser.add_argument('--batch-size', type=int, default=250, 
                        help='Batch size for embedding generation (max typically 250 for Vertex)')
    
    args = parser.parse_args()
    
    try:
        # Load the documents
        documents = load_documents_from_json(args.input)
        
        # Generate embeddings
        embedded_docs = embed_documents(
            documents,
            model_name=args.model,
            batch_size=args.batch_size
        )
        
        # Save to output file if specified
        if args.output:
            # Embeddings from VertexAIEmbeddings are already lists, no conversion needed
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(embedded_docs, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Saved {len(embedded_docs)} embedded documents to {args.output}")
        
        return embedded_docs
    
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        return None

if __name__ == "__main__":
    main()
