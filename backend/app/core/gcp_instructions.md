# Setting up GCP Cloud SQL for the RAG System

This document provides instructions for configuring Cloud SQL PostgreSQL for the RAG system.

## Prerequisites

1. Have a Google Cloud Platform (GCP) account and a project.
2. Enable the Cloud SQL Admin API in your project.
3. Have the `gcloud` CLI tool installed and authenticated.

## Creating a Cloud SQL PostgreSQL Instance

1. Navigate to the Cloud SQL page in the Google Cloud Console.
2. Click "Create Instance" and select PostgreSQL.
3. Configure the instance:
   - Name: `rag-postgres` (or your preferred name)
   - Password: Choose a secure password
   - Region/Zone: Choose according to your requirements
   - Database version: PostgreSQL 14 or higher (required for pgvector)
   - Machine type: Depends on your workload, at least 1 vCPU and 3.75 GB memory for development
   - Storage: Start with 10GB for development, can be increased later
   - Connections: Add authorized networks for development or use Private IP (recommended for production)

## Setting up the PostgreSQL Database

After the instance is created, follow these steps:

1. Connect to the instance using Cloud Shell or your local machine:
   ```bash
   gcloud sql connect rag-postgres --user=postgres
   ```

2. Create a dedicated database:
   ```sql
   CREATE DATABASE rag_system;
   ```

3. Connect to the newly created database:
   ```sql
   \c rag_system
   ```

4. Enable required extensions:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

5. Create the schema:
   ```sql
   -- Create workspaces table
   CREATE TABLE workspaces (
     workspace_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name TEXT NOT NULL,
     owner_user_id TEXT NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     config_chunking_method TEXT NOT NULL DEFAULT 'semantic',
     config_chunk_size INTEGER NOT NULL DEFAULT 1000,
     config_chunk_overlap INTEGER NOT NULL DEFAULT 100,
     config_similarity_metric TEXT NOT NULL DEFAULT 'cosine'
   );

   -- Create user_groups table
   CREATE TABLE user_groups (
     group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     group_name TEXT NOT NULL UNIQUE,
     description TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Create user_group_memberships table
   CREATE TABLE user_group_memberships (
     user_id TEXT NOT NULL,
     group_id UUID NOT NULL REFERENCES user_groups(group_id) ON DELETE CASCADE,
     PRIMARY KEY (user_id, group_id)
   );

   -- Create workspace_group_access table
   CREATE TABLE workspace_group_access (
     workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
     group_id UUID NOT NULL REFERENCES user_groups(group_id) ON DELETE CASCADE,
     PRIMARY KEY (workspace_id, group_id)
   );

   -- Table for document chunks with vector embeddings (will be used for RAG)
   CREATE TABLE document_chunks (
     chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
     document_id UUID NOT NULL,
     chunk_index INTEGER NOT NULL,
     content TEXT NOT NULL,
     embedding VECTOR(768), -- Dimension depends on the embedding model
     metadata JSONB,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE (document_id, chunk_index)
   );

   -- Table for document metadata
   CREATE TABLE documents (
     document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
     file_name TEXT NOT NULL,
     file_type TEXT NOT NULL,
     file_size INTEGER NOT NULL,
     gcs_uri TEXT NOT NULL,
     uploader_id TEXT NOT NULL,
     upload_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     processed BOOLEAN DEFAULT FALSE,
     processing_error TEXT
   );
   ```

## Connecting to Cloud SQL from the Application

### Option 1: TCP/IP Connection (Authorized Networks)

For development, you can add your IP address to the authorized networks:

1. In Cloud SQL instance details, go to "Connections" > "Networking"
2. Add your IP address to the authorized networks

In your `.env` file:
```
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=your_cloud_sql_ip
DB_PORT=5432
DB_NAME=rag_system
```

### Option 2: Unix Socket Connection (Cloud Run/App Engine)

For production deployments, especially on Google Cloud services like Cloud Run:

1. Set up appropriate IAM permissions for your service account.
2. In your `.env` file:
```
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=rag_system
USE_SOCKET=True
INSTANCE_CONNECTION_NAME=your-project:your-region:your-instance
```

3. When deploying to Cloud Run, add the connection name to the deployment:
```bash
gcloud run deploy --add-cloudsql-instances=INSTANCE_CONNECTION_NAME ...
```

## Maintenance

Remember to:
1. Set up automatic backups
2. Monitor performance with Cloud Monitoring
3. Consider high availability options for production use 