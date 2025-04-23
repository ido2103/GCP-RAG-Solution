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
*   **File Storage:** Google Cloud Storage (GCS) for direct uploads.
*   **Workspaces:** Users can manage distinct workspaces for different RAG contexts.
*   **Document Upload:** Supports uploading multiple documents of common types (.pdf, .docx, .txt, etc.) to specific workspaces.
*   **Admin Management:** Endpoints for admins to manage users, groups, roles, and workspace access (partially implemented).

## Tech Stack

*   **Backend:** Python, FastAPI, Uvicorn, Psycopg2, Firebase Admin SDK, Google Cloud Storage Client
*   **Frontend:** React, Vite, Axios, Firebase SDK
*   **Database:** PostgreSQL + pgvector (often run via Docker)
*   **Cloud Services:** Firebase Authentication, Google Cloud Storage

## Project Structure

```
.
├── backend/
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

### Prerequisites

*   Python 3.8+
*   Node.js 18+ and npm/yarn/pnpm
*   Docker and Docker Compose (recommended for PostgreSQL/pgvector)
*   Google Cloud SDK (`gcloud`) configured (for Cloud SQL connection, GCS, etc.)
*   Firebase Project created with Authentication enabled (Email/Password provider).
*   Google Cloud Storage bucket created.
*   PostgreSQL database (local or Cloud SQL) with pgvector extension enabled.

### Environment Variables

1.  **Backend (`.env`):** Create a `.env` file in the project root (this is ignored by git). See `.env.example` if one exists, otherwise include:
    ```env
    DATABASE_URL=postgresql://<db_user>:<db_password>@<db_host>:<db_port>/<db_name>
    GCS_BUCKET_NAME=<your-gcs-bucket-name>
    GCP_PROJECT_ID=<your-gcp-project-id>
    # GOOGLE_APPLICATION_CREDENTIALS=./backend/firebase-service-account.json # Optionally set for local GCS/Firebase Admin auth
    ```
    *Replace placeholders with your actual database credentials and GCS bucket name.*

2.  **Frontend (`frontend/.env`):** Create a `.env` file in the `frontend` directory (this is ignored by git). Copy the contents from `frontend/.env.example` (if it exists) or add your Firebase configuration keys, prefixed with `VITE_REACT_APP_`:
    ```env
    VITE_REACT_APP_FIREBASE_API_KEY=...
    VITE_REACT_APP_FIREBASE_AUTH_DOMAIN=...
    VITE_REACT_APP_FIREBASE_PROJECT_ID=...
    VITE_REACT_APP_FIREBASE_STORAGE_BUCKET=...
    VITE_REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
    VITE_REACT_APP_FIREBASE_APP_ID=...
    ```

### Firebase Admin SDK Key

1.  Go to your Firebase project settings -> Service accounts.
2.  Generate a new private key and download the JSON file.
3.  **Save this file** as `firebase-service-account.json` inside the `backend/` directory.
4.  **IMPORTANT:** This file is listed in `.gitignore` and **should never be committed to version control.** For production deployments, use Application Default Credentials or environment variables.

### Database Setup

1.  Ensure your PostgreSQL database (local Docker or Cloud SQL) is running.
2.  Connect to the database.
3.  Enable the `uuid-ossp` and `vector` extensions:
    ```sql
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
4.  Create the necessary tables by running the SQL commands found in the database setup section of the conversation history or relevant migration files.

### Backend Installation

```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment (recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Frontend Installation

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install
# or yarn install or pnpm install
```

## Running the Application

1.  **Start the Backend (FastAPI):**
    ```bash
    # Ensure you are in the backend directory with venv activated
    cd ../backend
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```
    The backend will be running on `http://localhost:8000`.

2.  **Start the Frontend (React/Vite):**
    ```bash
    # Ensure you are in the frontend directory
    cd ../frontend
    npm run dev
    # or yarn dev or pnpm dev
    ```
    The frontend development server (with proxy to backend) will typically start on `http://localhost:5173`.

## Authentication & Authorization

*   Users authenticate via Firebase using email/password.
*   The backend verifies Firebase ID tokens sent in the `Authorization: Bearer <token>` header.
*   **Admin Role:**
    *   Specific users can be granted the 'admin' role using Firebase Custom Claims.
    *   This must be done using the Firebase Admin SDK (e.g., via the `backend/set_admin_claims.py` script or a dedicated admin endpoint).
    *   Admin users have elevated privileges (e.g., creating workspaces, viewing all workspaces).
*   **Group Access (Work in Progress):**
    *   Admins can create/manage user groups via API endpoints.
    *   Admins can assign users to groups (sets custom claim).
    *   Admins can assign workspaces to groups (updates database).
    *   Endpoints for listing/getting workspaces need further refinement to respect group permissions for non-admin users.

## Future Work / TODOs

This section outlines planned enhancements and tasks:

### ✅ Completed (Recent Updates):
*   **Group-Based Access Control:** Implemented and refined workspace access permissions based on user group assignments.
*   **UI Improvements:** Improved the user interface to adapt to different user roles:
    *   Admin users have full access to workspace management and admin tools.
    *   Regular users only see workspaces they have access to via group membership.
    *   Added proper permission checks in both frontend and backend components.
*   **Protected Routes:** Added route protection to ensure users can only access pages appropriate for their role.
*   **Workspace Group Permissions:** Created admin UI for managing workspace-group access assignments with a visual matrix.
*   **Improved Error Handling:** Enhanced error messaging and user feedback throughout the application.

### Core RAG Pipeline (Next Focus)
*   **Implement Document Processing Pipeline:** Set up the sequence for handling uploaded documents:
    *   Text Extraction (from PDFs, DOCX, TXT, etc.)
    *   Text Chunking (strategies for optimal context size)
    *   Text Embedding Generation (using a chosen model like Vertex AI)
    *   Storing Embeddings & Metadata (in PostgreSQL/pgvector)
*   **Implement Query Endpoint:** Create the backend endpoint to handle user queries.
    *   Generate query embedding.
    *   Perform vector similarity search in PostgreSQL/pgvector.
    *   Retrieve relevant document chunks.
    *   Integrate with a Large Language Model (LLM) for answer generation (passing context + query).
*   **Frontend Query Interface:** Build the UI components for users to submit queries and view results within a workspace context.

### Access Control & Administration
*   **Further Admin Panel Enhancements:** Continue to improve and refine the admin panel UI:
    *   Add sorting, filtering, and pagination for better user/group management.
    *   Provide more detailed user activity tracking.

### Workspace & Document Management
*   **Enhance Workspace Creation/Management:** Add features like workspace descriptions, metadata, or deletion capabilities.
*   **Refine Document Upload:** Improve the GCS upload process (e.g., progress indicators, handling large files, preventing duplicate uploads or overwrites).

### General Enhancements & Maintenance
*   **Database Migrations:** Implement a formal database migration system (e.g., using Alembic) instead of manual SQL execution.
*   **Testing:** Add comprehensive unit and integration tests for both backend and frontend.
*   **User Profile Management:** Consider adding basic user profile features (e.g., password change, display name).
*   **Deployment:** Document deployment procedures for backend (Cloud Run), frontend (Firebase Hosting/Cloud Storage), and database (Cloud SQL).