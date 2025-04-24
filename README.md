# RAG System with Role-Based Access Control

This project implements a Retrieval-Augmented Generation (RAG) system featuring a Python FastAPI backend, a React frontend, PostgreSQL with pgvector for vector storage, Google Cloud Storage for file uploads, and Firebase Authentication with Role-Based Access Control (RBAC).

## Overview

The system allows users to create workspaces, upload documents relevant to those workspaces, and (eventually) interact with a RAG pipeline to query information based on the uploaded documents. Access control is implemented using Firebase Authentication, allowing administrators to manage user groups and restrict workspace visibility based on group assignments.

## Features

*   **Backend:** FastAPI (Python)
*   **Frontend:** React (Vite)
*   **Database:** PostgreSQL with pgvector extension (for efficient vector similarity search)
*   **Authentication:** Firebase Authentication (Email/Password)
*   **Authorization:** Role-Based Access Control (Admin/User roles via Firebase Custom Claims) and Group-based workspace access (partially implemented).
*   **File Storage:** Google Cloud Storage (GCS) for direct uploads. **Supports Local Storage in LOCAL_DEV mode.**
*   **Workspaces:** Users can manage distinct workspaces for different RAG contexts.
*   **Document Upload:** Supports uploading multiple documents of common types (.pdf, .docx, .txt, etc.) to specific workspaces.
*   **Admin Management:** Endpoints for admins to manage users, groups, roles, and workspace access (partially implemented).
*   **Local Development Mode:** Allows running the backend and processing pipeline locally, using local file storage and a local database, while still leveraging Vertex AI for ML models.

## Tech Stack

*   **Backend:** Python, FastAPI, Uvicorn, Psycopg2, Firebase Admin SDK, Google Cloud Storage Client, python-dotenv
*   **Processing:** Langchain, Langchain-Community, Langchain-Google-VertexAI, Unstructured
*   **Frontend:** React, Vite, Axios, Firebase SDK
*   **Database:** PostgreSQL + pgvector (often run via Docker)
*   **Cloud Services:** Firebase Authentication, Google Cloud Storage, Google Vertex AI

## Project Structure

```
.
├── backend/          # FastAPI backend
│   ├── app/
│   │   ├── db.py         # Database connection utilities
│   │   └── models.py     # Pydantic models
│   ├── main.py         # FastAPI application entrypoint
│   ├── set_admin_claims.py # Script to set admin claims (example)
│   ├── requirements.txt  # Backend dependencies
│   └── firebase-service-account.json # (IGNORED BY GIT) Service account key
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React contexts (e.g., AuthContext)
│   │   ├── services/     # API service wrappers (axios)
│   │   ├── utils/        # Utility functions
│   │   ├── App.jsx       # Main application component
│   │   ├── main.jsx      # React entry point
│   │   └── index.css     # Global styles
│   ├── .env.example    # Example environment variables for frontend
│   ├── eslint.config.js # Linter config
│   ├── index.html      # Entry HTML
│   ├── package.json    # Frontend dependencies
│   └── vite.config.js  # Vite configuration (including proxy)
├── .env                # (IGNORED BY GIT) Backend environment variables
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Setup

### 1. Prerequisites

- Python 3.10+
- PostgreSQL server (version compatible with pgvector extension)
- Node.js and npm/yarn (if using the frontend)
- Tesseract-OCR (Optional, but recommended for OCR capabilities of `unstructured` for image-based PDFs): [Install Tesseract](https://tesseract-ocr.github.io/tessdoc/Installation.html)

### 2. Clone the Repository

```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

### 3. Create Python Virtual Environment

```bash
python -m venv venv
# Activate (Windows)
source venv/Scripts/activate
# Activate (macOS/Linux)
# source venv/bin/activate
```

### 4. Install Python Dependencies

Install all backend and processing dependencies from the root `requirements.txt`:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Configure Environment Variables

- Copy the `.env.example` file (if one exists) or create a new `.env` file in the project root.
- Fill in the necessary values. **Crucially, set `LOCAL_DEV=true` for local testing.**

```dotenv
# .env Configuration Example

# --- Execution Mode ---
# Set to true to run locally, save files locally, use local DB
LOCAL_DEV=true

# --- Local PostgreSQL Database ---
# Used when LOCAL_DEV=true
DB_USER=postgres
DB_PASSWORD=your_secret_password
DB_NAME=rag_db
DB_HOST=localhost
DB_PORT=5432

# --- Google Cloud / Vertex AI ---
# Required for embedding/querying even in LOCAL_DEV mode
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=your-gcp-region
VERTEXAI_MODEL_NAME=gemini-1.5-flash-preview-0514 # Or your preferred LLM
# Ensure embedding model in workflow.yaml matches DB vector dimension

# --- Firebase Authentication ---
# Path to your downloaded service account key JSON file
# Place the file relative to the backend (e.g., in ./backend)
GOOGLE_APPLICATION_CREDENTIALS=./backend/firebase-service-account.json

# --- Local Storage Path (Optional) ---
# Where uploaded files are saved when LOCAL_DEV=true
# Defaults to ./local_uploads if not set
# LOCAL_STORAGE_PATH=./local_uploads

# --- Cloud SQL & GCS (Used when LOCAL_DEV=false) ---
# GCS_BUCKET_NAME=your-gcs-upload-bucket
# USE_SOCKET=false
# INSTANCE_CONNECTION_NAME=your-project:your-region:your-instance
# DB_SOCKET_DIR=/cloudsql
```

### 6. Set Up PostgreSQL Database

- Connect to your PostgreSQL server (e.g., using `psql` or a GUI like DBeaver/pgAdmin).
- Create the database specified in `DB_NAME` if it doesn't exist:
  ```sql
  CREATE DATABASE your_db_name; -- Use the name from your .env
  ```
- Connect to the newly created database.
- **Enable necessary extensions:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  -- Use either gen_random_uuid() (built-in) or uuid-ossp extension
  -- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  ```
- **Create the tables using the following schema:**

  ```sql
  -- Workspaces Table
  CREATE TABLE workspaces (
      workspace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name character varying(255) NOT NULL,
      owner_user_id character varying(255) NOT NULL,
      created_at timestamp with time zone DEFAULT now(),
      config_chunking_method text DEFAULT 'recursive'::text,
      config_chunk_size integer DEFAULT 1000,
      config_chunk_overlap integer DEFAULT 100,
      config_similarity_metric text DEFAULT 'cosine'::text -- Often represents embedding model
  );

  -- Documents Table (Stores metadata about uploaded files)
  CREATE TABLE documents (
      doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      user_id character varying(255) NOT NULL, -- User who uploaded
      filename character varying(512) NOT NULL,
      gcs_path character varying(1024) NULL, -- Path in GCS (if LOCAL_DEV=false)
      source_path text NULL, -- Can store local path or GCS URI
      file_size bigint NULL,
      status text DEFAULT 'pending'::text,
      uploaded_at timestamp with time zone DEFAULT now(),
      metadata jsonb NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS documents_gcs_path_key ON documents USING btree (gcs_path);
  CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents USING btree (workspace_id);

  -- Chunks Table (Stores text chunks and links to documents)
  CREATE TABLE document_chunks (
      chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      text text NOT NULL,
      chunking_method text NULL,
      chunk_size integer NULL,
      chunk_overlap integer NULL,
      metadata jsonb NULL,
      created_at timestamp with time zone DEFAULT now(),
      UNIQUE (document_id, chunk_index)
  );
  CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks USING btree (document_id);

  -- Vectors Table (Stores embeddings linked to chunks)
  CREATE TABLE document_vectors (
      vector_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      chunk_id uuid NOT NULL REFERENCES document_chunks(chunk_id) ON DELETE CASCADE,
      embedding_model text NOT NULL,
      vector vector(768), -- IMPORTANT: Adjust vector(768) dimension based on your embedding_model
      metadata jsonb,
      created_at timestamp with time zone DEFAULT NOW()
  );
  -- Example Index (Adjust parameters as needed, requires pgvector)
  CREATE INDEX IF NOT EXISTS document_vectors_vector_idx ON document_vectors USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);

  -- User Groups Table
  CREATE TABLE user_groups (
      group_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      group_name character varying(100) NOT NULL UNIQUE,
      description text NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  );

  -- User Group Memberships Table (Many-to-Many)
  CREATE TABLE user_group_memberships (
      user_id character varying(255) NOT NULL,
      group_id uuid NOT NULL REFERENCES user_groups(group_id) ON DELETE CASCADE,
      assigned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, group_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_group_memberships_user_id ON user_group_memberships USING btree (user_id);
  CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group_id ON user_group_memberships USING btree (group_id);

  -- Workspace Group Access Table (Many-to-Many)
  CREATE TABLE workspace_group_access (
      workspace_id uuid NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      group_id uuid NOT NULL REFERENCES user_groups(group_id) ON DELETE CASCADE,
      assigned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, group_id)
  );
  CREATE INDEX IF NOT EXISTS idx_workspace_group_access_workspace_id ON workspace_group_access USING btree (workspace_id);
  CREATE INDEX IF NOT EXISTS idx_workspace_group_access_group_id ON workspace_group_access USING btree (group_id);
  ```

  **Note on `document_vectors.vector`:** The dimension `vector(768)` is a placeholder. You **must** adjust this number to match the output dimension of the embedding model specified in `defaults.embedding_model` in your `workflow.yaml` (e.g., `text-multilingual-embedding-002` uses 768). Check the model documentation for the correct dimension.

### 7. Set Up Firebase

- Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
- Enable Firebase Authentication (e.g., Email/Password or Google Sign-in).
- Go to Project Settings -> Service accounts.
- Generate a new private key and download the JSON file.
- Place the downloaded file in the `./backend` directory and name it `firebase-service-account.json` (or update the `GOOGLE_APPLICATION_CREDENTIALS` path in `.env`).
- (Optional) Set up custom claims for roles/groups if using the admin features. Refer to Firebase documentation.

### 8. Set Up Frontend (If applicable)

```bash
cd frontend
npm install # or yarn install
# Configure API endpoint in frontend code if necessary (usually points to /api for proxy)
npm run dev # or yarn dev
```

## Running the Application

### Backend

- Activate your virtual environment (`venv/Scripts/activate` or `source venv/bin/activate`).
- Navigate to the `backend` directory.
- Run the FastAPI server:
  ```bash
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
  ```
  The API will be available at `http://localhost:8000`.

### Processing Pipeline (Standalone)

- You can run the processing pipeline directly from the command line.
- Activate your virtual environment.
- Navigate to the `processing` directory.
- Example command:
  ```bash
  python main.py --config workflow.yaml --workspace-id <your-workspace-uuid> --input-type local_file --file-path /path/to/your/document.pdf
  ```
  Use `--help` for more options: `python main.py --help`

### Frontend

```bash
# Ensure you are in the frontend directory
cd ../frontend
npm run dev
# or yarn dev or pnpm dev
```
The frontend development server (with proxy to backend) will typically start on `http://localhost:5173`.

## Local Development Mode (`LOCAL_DEV=true`)

- Backend uses connection details from `DB_*` env vars to connect to local PostgreSQL.
- File uploads via `/api/uploads/direct` are saved to the path specified by `LOCAL_STORAGE_PATH` (defaults to `./local_uploads`).
- After saving locally, the backend triggers `processing/main.py` as a subprocess to process the file.
- Intermediate processing outputs are stored under `./local_processing_output` (configurable in `workflow.yaml`).
- Database operations (chunking, storing vectors) target the local PostgreSQL DB.
- Cleanup of intermediate files in `./local_processing_output` is skipped by default (controlled by `cleanup.remove_temp_files` in `workflow.yaml`).
- GCP services (like GCS for storage) are bypassed, **except for Vertex AI API calls** for embedding and querying, which still require GCP authentication (ADC or service account) and internet connectivity.

## Cloud Deployment (Conceptual - `LOCAL_DEV=false`)

- Backend connects to Cloud SQL (ideally using Cloud SQL Auth Proxy/socket - configure `USE_SOCKET` and `INSTANCE_CONNECTION_NAME`).
- File uploads go directly to the GCS bucket specified by `GCS_BUCKET_NAME`.
- GCS uploads trigger a Cloud Function or Cloud Run service (not part of this backend code) that runs the processing pipeline, reading from GCS and writing to Cloud SQL.
- Query endpoint reads from Cloud SQL.

## Authentication & Authorization

*   Users authenticate via Firebase using email/password.
*   The backend verifies Firebase ID tokens sent in the `Authorization: Bearer <token>` header.
*   **Admin Role:**
    *   Specific users can be granted the 'admin' role using Firebase Custom Claims.
    *   This must be done using the Firebase Admin SDK (e.g., via the `backend/set_admin_claims.py` script or a dedicated admin endpoint).
    *   Admin users have elevated privileges (e.g., creating workspaces, viewing all workspaces).
*   **Group Access:**
    *   Admins can create/manage user groups via API endpoints.
    *   Admins can assign users to groups (sets custom claim).
    *   Admins can assign workspaces to groups (updates database).
    *   Endpoints for listing/getting workspaces respect group permissions for non-admin users.

## Future Work / TODOs

This section outlines planned enhancements and tasks:

### ✅ Completed (Recent Updates):
*   **Group-Based Access Control:** Implemented and refined workspace access permissions based on user group assignments.
*   **UI Improvements:** Improved the user interface to adapt to different user roles.
*   **Protected Routes:** Added route protection.
*   **Workspace Group Permissions Admin UI:** Created admin UI for managing workspace-group access.
*   **Improved Error Handling:** Enhanced error messaging.
*   **Local Dev Mode:** Implemented local file storage, DB usage, and processing trigger.

### Core RAG Pipeline (Next Focus)
*   **Implement Query Endpoint:** Create the backend endpoint to handle user queries (Partially done, needs connection to frontend).
*   **Frontend Query Interface:** Build the UI components for users to submit queries and view results.

### Access Control & Administration
*   **Further Admin Panel Enhancements:** Add sorting, filtering, and pagination.

### Workspace & Document Management
*   **Enhance Workspace Creation/Management:** Add features like editing configs, descriptions, deletion.
*   **Refine Document Upload:** Improve GCS upload process (progress, large files, duplicates).
*   **List/Manage Processed Documents:** API/UI to see documents within a workspace.

### General Enhancements & Maintenance
*   **Database Migrations:** Implement Alembic or similar.
*   **Testing:** Add unit and integration tests.
*   **User Profile Management:** Password change, display name.
*   **Deployment:** Document deployment procedures.