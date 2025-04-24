import logging
import argparse
import json
from typing import List, Dict, Any, Optional, Union
import os

from langchain.schema.document import Document
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    CharacterTextSplitter,
    TokenTextSplitter,
    MarkdownHeaderTextSplitter,
    HTMLHeaderTextSplitter,
    SentenceTransformersTokenTextSplitter
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mapping of chunking method names to their respective splitter classes
CHUNKER_MAPPING = {
    "recursive": RecursiveCharacterTextSplitter,
    "character": CharacterTextSplitter,
    "token": TokenTextSplitter,
    "markdown": MarkdownHeaderTextSplitter,
    "html": HTMLHeaderTextSplitter,
    "sentence_transformers": SentenceTransformersTokenTextSplitter,
}

def load_documents_from_json(file_path: str) -> List[Document]:
    """
    Load documents from a JSON file in the format produced by the extract_text module.
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

def get_text_splitter(
    chunking_method: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    model_name: Optional[str] = "sentence-transformers/all-MiniLM-L6-v2",
    **kwargs
):
    """Get the appropriate text splitter based on the method name."""
    logger.info(f"Attempting to get splitter: method='{chunking_method}', size={chunk_size}, overlap={chunk_overlap}, model='{model_name}'")
    
    if chunking_method not in CHUNKER_MAPPING:
        raise ValueError(f"Unsupported chunking method: {chunking_method}. Supported methods: {', '.join(CHUNKER_MAPPING.keys())}")
        
    splitter_class = CHUNKER_MAPPING[chunking_method]
    
    # Handle initialization arguments based on splitter type
    try:
        if chunking_method in ["recursive", "character"]:
            # These use basic size/overlap
            splitter = splitter_class(chunk_size=chunk_size, chunk_overlap=chunk_overlap, **kwargs)
        elif chunking_method in ["token", "sentence_transformers"]:
            # These potentially use model name, size, overlap
            # Ensure correct parameters are passed
            init_kwargs = {
                "chunk_overlap": chunk_overlap
            }
            if chunking_method == "token":
                 init_kwargs["encoding_name"] = "cl100k_base" # Example encoding, might need adjustment
                 init_kwargs["chunk_size"] = chunk_size
            elif chunking_method in ["sentence_transformers"]:
                 init_kwargs["model_name"] = model_name
                 # Sentence transformer often measures size in tokens, not characters
                 init_kwargs["tokens_per_chunk"] = chunk_size 

            # Add any other relevant kwargs passed in
            init_kwargs.update(kwargs)
            
            splitter = splitter_class(**init_kwargs)
            
        elif chunking_method in ["markdown", "html"]:
            # Header splitters might have different parameters (e.g., headers_to_split_on)
            # For now, use defaults or passed kwargs if applicable
             headers_to_split_on = kwargs.get("headers_to_split_on", [])
             if chunking_method == "markdown":
                 splitter = splitter_class(headers_to_split_on=headers_to_split_on or [("#", "Header 1"), ("##", "Header 2"), ("###", "Header 3")])
             elif chunking_method == "html":
                  splitter = splitter_class(headers_to_split_on=headers_to_split_on or [("h1", "Header 1"), ("h2", "Header 2"), ("h3", "Header 3")])
             else: # Fallback for safety, though covered by initial check
                  splitter = splitter_class(**kwargs) # Pass any other args
        else:
            # Fallback for any other defined types (shouldn't be reached due to initial check)
            splitter = splitter_class(**kwargs) # Pass any relevant args
            
        logger.info(f"Initialized splitter: {splitter.__class__.__name__} with effective params.")
        return splitter
        
    except Exception as e:
        logger.error(f"Failed to initialize splitter '{splitter_class.__name__}' with method '{chunking_method}': {e}", exc_info=True)
        raise

def chunk_documents(
    documents: List[Document],
    chunking_method: str = "recursive",
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    **kwargs
) -> List[Document]:
    """
    Split documents into chunks using the specified method.
    
    Args:
        documents: The documents to split.
        chunking_method: The method to use for splitting.
        chunk_size: The size of each chunk.
        chunk_overlap: The overlap between chunks.
        **kwargs: Additional arguments for the specific splitter.
    
    Returns:
        A list of document chunks.
    """
    try:
        # Get the appropriate text splitter
        text_splitter = get_text_splitter(chunking_method, chunk_size, chunk_overlap, **kwargs)
        
        # Split the documents
        chunked_documents = text_splitter.split_documents(documents)
        
        # Add chunking metadata
        for i, doc in enumerate(chunked_documents):
            doc.metadata["chunk_index"] = i
            doc.metadata["chunking_method"] = chunking_method
            doc.metadata["chunk_size"] = chunk_size
            doc.metadata["chunk_overlap"] = chunk_overlap
        
        logger.info(f"Split {len(documents)} documents into {len(chunked_documents)} chunks using {chunking_method} method")
        return chunked_documents
    
    except Exception as e:
        logger.error(f"Error chunking documents: {str(e)}")
        raise

def main():
    """Command-line interface for text chunking"""
    parser = argparse.ArgumentParser(description='Split documents into chunks')
    parser.add_argument('--input', required=True, help='Input JSON file with documents')
    parser.add_argument('--output', help='Output JSON file to save chunked documents (optional)')
    parser.add_argument('--method', default='recursive', help='Chunking method')
    parser.add_argument('--chunk-size', type=int, default=1000, help='Chunk size')
    parser.add_argument('--chunk-overlap', type=int, default=200, help='Chunk overlap')
    parser.add_argument('--separator', help='Custom separator for character splitter')
    
    args = parser.parse_args()
    
    try:
        # Load the documents
        documents = load_documents_from_json(args.input)
        
        # Prepare kwargs for the text splitter
        kwargs = {}
        if args.separator:
            kwargs["separator"] = args.separator
        
        # Chunk the documents
        chunked_docs = chunk_documents(
            documents,
            chunking_method=args.method,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
            **kwargs
        )
        
        # Save to output file if specified
        if args.output:
            # Convert documents to serializable format
            serializable_docs = [{"text": doc.page_content, "metadata": doc.metadata} for doc in chunked_docs]
            
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(serializable_docs, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Saved {len(chunked_docs)} chunks to {args.output}")
        
        return chunked_docs
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return None

if __name__ == "__main__":
    main()
