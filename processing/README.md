# RAG Processing Pipeline (GCP Focused)

This directory contains the implementation of a Retrieval-Augmented Generation (RAG) processing pipeline built with Langchain, specifically focused on using Google Cloud Platform (GCP) services. The pipeline handles document extraction, chunking, embedding generation using Vertex AI, storage in PostgreSQL with pgvector, and query processing using Vertex AI LLMs.

## Directory Structure

```
processing/
├── main.py                  # Main orchestration script for ingestion
├── workflow.yaml            # Ingestion pipeline configuration
├── requirements.txt         # Combined dependencies for all modules
├── extract_text/            # Document text extraction
│   ├── main.py              # Text extraction module
│   └── requirements.txt     # Text extraction dependencies
├── chunk_text/              # Text chunking
│   ├── main.py              # Chunking module
│   └── requirements.txt     # Chunking dependencies
├── embed_text/              # Embedding generation (Vertex AI)
│   ├── main.py              # Embedding module
│   └── requirements.txt     # Embedding dependencies
├── store_data/              # Vector storage (PostgreSQL/pgvector)
│   ├── main.py              # Database storage module
│   └── requirements.txt     # Storage dependencies
└── query/                   # Query processing (Vertex AI)
    ├── main.py              # Query module
    └── requirements.txt     # Query dependencies
```

## Pipeline Overview

**Ingestion Pipeline (`main.py` using `workflow.yaml`):**

1.  **Extract Text**: Extracts text from various file formats (PDF, DOCX, TXT, HTML, etc.) using Langchain loaders.
2.  **Chunk Text**: Splits text into manageable chunks based on configuration settings (method, size, overlap).
3.  **Embed Text**: Generates vector embeddings for each text chunk using specified Vertex AI models (e.g., `text-multilingual-embedding-002`). Uses Application Default Credentials (ADC) for authentication.
4.  **Store Data**: Saves document metadata, text chunks, and vector embeddings in PostgreSQL/pgvector. Dynamically handles vector dimensions based on the embedding model.

**Query Processing (`query/main.py`):**

1.  **Embed Query**: Generates an embedding for the user's query using the same Vertex AI model used during ingestion.
2.  **Retrieve Context**: Performs a similarity search in the pgvector database to find relevant text chunks for the given workspace.
3.  **Generate Answer**: Sends the query and retrieved context to a Vertex AI Large Language Model (LLM) (e.g., Gemini models) to synthesize an answer.

## Installation

```bash
# Navigate to the processing directory
cd processing

# Create a virtual environment (recommended)
python -m venv venv
# Activate the virtual environment (Windows)
venv\Scripts\activate
# Activate the virtual environment (Linux/macOS)
# source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

## Configuration

- **Environment Variables (`.env` file):**
    - Place a `.env` file in the project root or `processing` directory.
    - **Required for `store_data` and `query`:** Define database connection details:
        ```dotenv
        # Option 1: Full URL (Recommended if available)
        DATABASE_URL=postgresql://user:password@host:port/dbname
        # Option 2: Individual components (Cloud SQL Proxy Example)
        # DB_USER=postgres
        # DB_PASSWORD=your-secret-password
        # DB_HOST=/cloudsql/your-project-id:your-region:your-instance-name # Example for Cloud SQL Proxy/Socket
        # DB_PORT=5432
        # DB_NAME=postgres
        ```
    - **Optional for `query`:** Specify the default Vertex AI LLM model:
        ```dotenv
        VERTEXAI_MODEL_NAME=gemini-1.5-pro-latest
        ```
- **Workflow Configuration (`workflow.yaml`):** Defines the steps and default parameters for the *ingestion* pipeline.
    - `workspace_id`: Must be provided via CLI during execution.
    - `embedding_model`: Set the desired Vertex AI model (e.g., `text-multilingual-embedding-002`).
    - `input`: Configure the source of documents (GCS, local file/directory).
- **Google Cloud Authentication:** Ensure Application Default Credentials (ADC) are configured in your environment for Vertex AI embedding and LLM usage. Run `gcloud auth application-default login`.
- **Hebrew OCR (Optional):** If processing image-based PDFs with Hebrew text, ensure Tesseract language packs for Hebrew (`heb`) are installed in the environment where the pipeline runs (e.g., in the Docker container).

## Usage

### Ingestion Pipeline (`main.py`)

Run from the `processing` directory.

**Required:** `--workspace-id`

**Input Options (only one):**
*   `--input-type gcs --bucket-name BUCKET --object-name PATH/TO/FILE.pdf`
*   `--input-type local_file --file-path path/to/document.pdf`
*   `--input-type local_dir --directory-path path/to/documents`

**Overrides (Optional):**
*   `--embedding-model text-multilingual-embedding-002`
*   `--chunking-method recursive`
*   `--chunk-size 1000`
*   `--chunk-overlap 150`
*   `--connection-string postgresql://...` (Overrides `.env`)
*   `--env-file ../.env` (Specify path to `.env` file)

**Example (GCS Input, Vertex AI Multilingual Embeddings):**
```bash
python main.py --workspace-id "123e4567-e89b-12d3-a456-426614174000" \
               --input-type gcs --bucket-name "your-gcs-bucket" --object-name "uploads/document.pdf" \
               --embedding-model "text-multilingual-embedding-002"
```

### Query Processing (`query/main.py`)

Run from the `processing` directory.

**Required:**
*   `-q "Your query text?"` or `--query "Your query text?"`
*   `-w WORKSPACE_UUID` or `--workspace-id WORKSPACE_UUID`

**Options:**
*   `--embedding-model text-multilingual-embedding-002` (Should match ingestion model)
*   `--model-name gemini-1.5-pro-latest` (Specific Vertex AI LLM model)
*   `--connection-string postgresql://...` (Overrides `.env`)
*   `--top-k 5` (Number of chunks to retrieve)
*   `--output result.json` (Save output to file)
*   `--env-file ../.env` (Specify path to `.env` file)

**Example (Hebrew Query, Vertex AI):**
```bash
python query/main.py -w "123e4567-e89b-12d3-a456-426614174000" -q "מה עיקר המסמך?" \
                    --embedding-model "text-multilingual-embedding-002" \
                    --model-name "gemini-1.5-pro-latest"
```

## Integration with Backend

This pipeline is designed to be run as a standalone process, typically triggered by backend events.

1.  **Triggering Ingestion:** Modify the FastAPI backend (`backend/main.py`). When a file is uploaded via `/api/uploads/direct` and lands in GCS, trigger the `processing/main.py` script. Recommended approach: Use Google Cloud Tasks or Pub/Sub (as detailed previously) to send a message containing the `workspace_id` and GCS file details (`bucket_name`, `object_name`). A Cloud Function or Cloud Run service (built using the `Dockerfile` in this repo) can listen for these messages and execute `python processing/main.py --workspace-id ... --input-type gcs ...`. The trigger mechanism should ideally retrieve workspace-specific configurations (like the embedding model) from the database to pass to the script.
2.  **Handling Queries:** Create a new endpoint in the FastAPI backend (e.g., `/api/workspaces/{workspace_id}/query`). This endpoint should:
    *   Take the user's query as input.
    *   Call the `process_query` function from `processing.query.main` (requires adding `processing` to Python path or restructuring). The backend will need access to DB credentials via environment variables or other secure means.
    *   Pass necessary arguments like `query`, `workspace_id`, and potentially the LLM model name if configurable.
    *   Return the response (answer or error) to the frontend.

## Database Schema

The pipeline creates/uses three primary tables (prefixed if `--table-prefix` is used):

1.  `documents`: Stores document metadata (file name, type, size, workspace ID, etc.)
2.  `document_chunks`: Stores individual text chunks with references to their parent document.
3.  `document_vectors`: Stores vector embeddings (`VECTOR` type) for each chunk, linked to the chunk and embedding model used.

## Extending the Pipeline

- **File Formats:** Add loaders in `extract_text/main.py`.
- **Chunking Methods:** Add splitters in `chunk_text/main.py`.
- **Embedding Models:** Add *Vertex AI* models to `EMBEDDING_MODELS` in `embed_text/main.py`.
- **LLMs:** Add logic to `get_llm` in `query/main.py` for different *Vertex AI* models.

## Troubleshooting

- **Imports:** Ensure the `processing` directory or its parent is in the `PYTHONPATH` if calling modules from elsewhere.
- **ADC:** Verify `gcloud auth application-default login` has been run for Vertex AI access.
- **DB Connection:** Double-check `.env` variables or connection string. Ensure the service account for Cloud Run/Function has Cloud SQL Client IAM role.
- **pgvector:** Ensure the extension is enabled in your PostgreSQL database (`CREATE EXTENSION IF NOT EXISTS vector;`).
- **Vector Dimension:** Mismatches between the dimension in the `document_vectors` table and the Vertex AI embedding model will cause errors. The `store_data` script attempts to detect this but altering existing tables with data is risky.
- **Memory/Timeout:** Large files might require more memory or longer timeouts for Cloud Run/Function execution.
- **Permissions:** The service account running the processing pipeline needs permissions for GCS (read), Pub/Sub (if used), Cloud Tasks (if used), Vertex AI (predict), and potentially Secret Manager and Cloud SQL. 