import os
import logging
import argparse
from typing import Dict, List, Any, Optional
import mimetypes
import tempfile

from langchain_community.document_loaders import (
    PyMuPDFLoader,
    Docx2txtLoader,
    TextLoader,
    CSVLoader,
    UnstructuredExcelLoader,
    UnstructuredPowerPointLoader,
    UnstructuredHTMLLoader,
    UnstructuredMarkdownLoader,
    UnstructuredXMLLoader,
    UnstructuredFileLoader
)
from langchain.schema.document import Document
from google.cloud import storage

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mapping of file extensions to their respective loaders
LOADER_MAPPING = {
    '.pdf': PyMuPDFLoader,
    '.txt': TextLoader,
    '.doc': Docx2txtLoader,
    '.docx': Docx2txtLoader,
    '.csv': CSVLoader,
    '.xls': UnstructuredExcelLoader,
    '.xlsx': UnstructuredExcelLoader,
    '.ppt': UnstructuredPowerPointLoader,
    '.pptx': UnstructuredPowerPointLoader,
    '.html': UnstructuredHTMLLoader,
    '.htm': UnstructuredHTMLLoader,
    '.md': UnstructuredMarkdownLoader,
    '.xml': UnstructuredXMLLoader,
    '.json': UnstructuredFileLoader,
}

def get_file_extension(file_path: str) -> str:
    """Get the file extension from a file path."""
    _, ext = os.path.splitext(file_path.lower())
    return ext

def extract_text_from_file(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract text from a file using the appropriate loader based on file extension.
    Returns a list of documents with text and metadata.
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Get file extension and find appropriate loader
    ext = get_file_extension(file_path)
    
    if ext not in LOADER_MAPPING:
        logger.error(f"Unsupported file type: {ext}")
        raise ValueError(f"Unsupported file type: {ext}")
    
    try:
        loader_class = LOADER_MAPPING[ext]
        loader = loader_class(file_path)
        logger.info(f"Using {loader_class.__name__} for file: {file_path}")
        
        # Load the document and return the documents list
        documents = loader.load()
        
        # Add file metadata to each document
        for doc in documents:
            if not hasattr(doc, 'metadata') or not doc.metadata:
                doc.metadata = {}
            
            doc.metadata.update({
                'source': file_path,
                'file_name': os.path.basename(file_path),
                'file_type': ext,
                'file_size': os.path.getsize(file_path)
            })
        
        logger.info(f"Successfully extracted {len(documents)} document(s) from {file_path}")
        return documents
    
    except Exception as e:
        logger.error(f"Error extracting text from {file_path}: {str(e)}")
        raise

def extract_text_from_directory(directory_path: str, recursive: bool = True) -> List[Dict[str, Any]]:
    """
    Extract text from all supported files in a directory.
    If recursive=True, also process files in subdirectories.
    """
    if not os.path.isdir(directory_path):
        logger.error(f"Directory not found: {directory_path}")
        raise FileNotFoundError(f"Directory not found: {directory_path}")
    
    all_documents = []
     
    for root, dirs, files in os.walk(directory_path):
        for file in files:
            file_path = os.path.join(root, file)
            ext = get_file_extension(file_path)
            
            if ext in LOADER_MAPPING:
                try:
                    docs = extract_text_from_file(file_path)
                    all_documents.extend(docs)
                except Exception as e:
                    logger.warning(f"Skipping file {file_path} due to error: {str(e)}")
        
        # If not recursive, don't process subdirectories
        if not recursive:
            break
    
    logger.info(f"Extracted {len(all_documents)} document(s) from directory: {directory_path}")
    return all_documents

def process_gcs_file(bucket_name: str, object_name: str, local_temp_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Download a file from Google Cloud Storage to a temporary location and process it.
    
    Args:
        bucket_name: The name of the GCS bucket.
        object_name: The name/path of the object in the bucket.
        local_temp_dir: Optional directory to save the temporary file.
    
    Returns:
        List of extracted document chunks.
    """
    try:
        if not local_temp_dir:
            local_temp_dir = os.path.join(os.getcwd(), 'temp')
        
        os.makedirs(local_temp_dir, exist_ok=True)
        
        # Download file from GCS
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        
        file_name = os.path.basename(object_name)
        local_path = os.path.join(local_temp_dir, file_name)
        
        logger.info(f"Downloading {object_name} from GCS bucket {bucket_name} to {local_path}")
        blob.download_to_filename(local_path)
        
        # Process the downloaded file
        documents = extract_text_from_file(local_path)
        
        # Clean up the temporary file
        os.remove(local_path)
        logger.info(f"Removed temporary file: {local_path}")
        
        return documents
    
    except ImportError:
        logger.error("Google Cloud Storage client library not installed")
        raise ImportError("Please install google-cloud-storage: pip install google-cloud-storage")
    except Exception as e:
        logger.error(f"Error processing GCS file {object_name}: {str(e)}")
        raise

def main():
    """Command-line interface for text extraction"""
    parser = argparse.ArgumentParser(description='Extract text from documents')
    parser.add_argument('--input', required=True, help='Input file or directory path')
    parser.add_argument('--recursive', action='store_true', help='Process directories recursively')
    parser.add_argument('--output', help='Output JSON file to save documents (optional)')
    parser.add_argument('--gcs', action='store_true', help='Treat input as GCS path (bucket/object)')
    
    args = parser.parse_args()
    
    try:
        if args.gcs:
            # Parse GCS path (format: bucket/path/to/object)
            parts = args.input.strip('/').split('/', 1)
            if len(parts) != 2:
                raise ValueError("GCS path must be in format 'bucket/path/to/object'")
            
            bucket_name, object_name = parts
            documents = process_gcs_file(bucket_name, object_name)
        
        elif os.path.isdir(args.input):
            documents = extract_text_from_directory(args.input, args.recursive)
        
        elif os.path.isfile(args.input):
            documents = extract_text_from_file(args.input)
        
        else:
            logger.error(f"Input not found: {args.input}")
            raise FileNotFoundError(f"Input not found: {args.input}")
        
        logger.info(f"Extracted {len(documents)} document(s) total")
        
        # Save to output file if specified
        if args.output:
            import json
            
            # Convert documents to serializable format
            serializable_docs = [{"text": doc.page_content, "metadata": doc.metadata} for doc in documents]
            
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(serializable_docs, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Saved documents to {args.output}")
        
        return documents
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return None

if __name__ == "__main__":
    main()
