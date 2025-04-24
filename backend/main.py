# backend/main.py

# --- Standard Imports ---
import logging
import os
import uuid
from contextlib import contextmanager
from typing import List, Dict, Optional, Any
import datetime
import mimetypes
import sys # Added for path manipulation
import subprocess # Added for local processing trigger
import shutil # Added for local file saving
from dotenv import load_dotenv # Added for .env loading

# --- Load Environment Variables FIRST ---
# Construct the path to the root .env file (assuming backend is one level down)
_DOTENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
if os.path.exists(_DOTENV_PATH):
    load_dotenv(dotenv_path=_DOTENV_PATH)
    print(f"Loaded environment variables from: {_DOTENV_PATH}")
else:
    print(f"Warning: Root .env file not found at {_DOTENV_PATH}")
 
# Determine execution mode
IS_LOCAL_DEV = os.getenv("LOCAL_DEV", "false").lower() == "true"
print(f"--- Running in LOCAL_DEV mode: {IS_LOCAL_DEV} ---")

# --- FastAPI Imports ---
from fastapi import FastAPI, Depends, HTTPException, status, Path, Query, File, UploadFile, Form, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
import asyncio # Import asyncio for the stream generator
 
# --- Database Imports ---
import psycopg2
import psycopg2.extras  # Added for execute_batch and other utilities
from psycopg2 import pool # Although pool is used in db.py, importing here can be useful for type hinting if needed
 
# --- Google Cloud Imports ---

# --- Configuration Loading ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Conditionally import storage client
if not IS_LOCAL_DEV:
    try:
        from google.cloud import storage
        from google.api_core import exceptions as google_exceptions
    except ImportError:
        storage = None # Set to None if not installed or not needed
        google_exceptions = None
        print("Note: google-cloud-storage not imported (or not installed). GCS features disabled.")
else:
    storage = None # Not needed for local dev
    google_exceptions = None

# --- Local Application Imports ---
from app import models, db # Your local models and db connection utility

# --- Firebase Imports ---
import firebase_admin
from firebase_admin import credentials, auth

# --- Processing Pipeline Imports ---
# Add processing directory to sys.path to allow imports
_PROCESSING_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'processing'))
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Add project root to allow imports like `from processing.query.main`
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)
    logger.info(f"Added project root to sys.path: {_PROJECT_ROOT}")

try:
    # Corrected import path relative to project root
    from processing.query.main import process_query, process_query_stream 
    logger.info("Successfully imported process_query and process_query_stream from processing.query.main")
except ImportError as e:
    logger.error(f"Could not import process_query or process_query_stream: {e}. Query endpoint will likely fail.", exc_info=True)
    process_query = None # Define as None if import fails
    process_query_stream = None
except ModuleNotFoundError as e:
     logger.error(f"Could not find processing module: {e}. Ensure structure is correct and processing is in PYTHONPATH.", exc_info=True)
     process_query = None
     process_query_stream = None


# --- Load GCS/GCP Config (Only if not in local dev mode) ---
GCS_BUCKET_NAME = None
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_REGION = os.getenv("GCP_REGION")

if not IS_LOCAL_DEV:
    GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
    if not GCS_BUCKET_NAME:
        logger.warning("GCS_BUCKET_NAME environment variable is not set. GCS uploads will fail.")
    else:
         logger.info(f"Backend configured with GCS_BUCKET_NAME: {GCS_BUCKET_NAME}")
else:
     logger.info("Running in LOCAL_DEV mode. GCS uploads disabled.")

if GCP_PROJECT_ID:
    logger.info(f"GCP Project ID: {GCP_PROJECT_ID}")
if GCP_REGION:
    logger.info(f"GCP Region: {GCP_REGION}")

# Define Local Storage Path (used only if IS_LOCAL_DEV is True)
LOCAL_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'local_uploads')))
if IS_LOCAL_DEV:
    logger.info(f"Local file storage path: {LOCAL_STORAGE_PATH}")
    os.makedirs(LOCAL_STORAGE_PATH, exist_ok=True)

# --- FastAPI App Initialization ---
app = FastAPI(
    title="RAG System Backend",
    description="API for managing workspaces, documents, uploads, and queries for the RAG system.",
    version="0.1.0"
)

# --- Database Initialization (Crucial - after env load) ---
try:
    db.init_db_pool() # Initialize the pool using loaded env vars and IS_LOCAL_DEV flag
except ValueError as e:
     logger.error(f"FATAL: Database configuration error: {e}. Application might not function correctly.")
     # Decide if you want to exit or let it fail later
except Exception as e:
    logger.error(f"FATAL: Failed to initialize database pool: {e}", exc_info=True)
    # Decide if you want to exit

# --- Dependencies ---

# Database Session Dependency
@contextmanager
def get_db_session():
    """Provides a database session from the pool within a context manager."""
    conn = None
    try:
        conn = db.get_db_connection() # Get connection from initialized pool
        yield conn
        conn.commit()
    except (Exception, psycopg2.Error) as error:
        logger.error(f"Database error occurred: {error}", exc_info=True)
        if conn:
            try:
                conn.rollback()
                logger.info("Transaction rolled back due to error.")
            except Exception as rollback_err:
                logger.error(f"Error during rollback: {rollback_err}", exc_info=True)
        if isinstance(error, HTTPException):
             raise error
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database operation failed")
    finally:
        if conn:
            db.release_db_connection(conn)

# Google Cloud Storage Client Dependency (Conditional)
_gcs_client = None
def get_gcs_client():
    """Dependency function to get a GCS client instance (singleton pattern). Returns None if in local dev."""
    if IS_LOCAL_DEV:
        return None # No GCS client needed/used in local dev
        
    global _gcs_client
    if _gcs_client is None:
        if storage is None:
             logger.error("Attempted to get GCS client, but google-cloud-storage is not available.")
             raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                 detail="Cloud Storage client not available.")
        try:
            logger.info("Initializing Google Cloud Storage client...")
            _gcs_client = storage.Client(project=GCP_PROJECT_ID)
            logger.info("Google Cloud Storage client initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Google Cloud Storage client: {e}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Could not connect to Cloud Storage service.")
    return _gcs_client

# Initialize Firebase Admin SDK
# Check if Firebase app is already initialized to avoid multiple initializations
if not firebase_admin._apps:
    firebase_cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./firebase-service-account.json") # Use env var or default path
    try:
        if os.path.exists(firebase_cred_path):
            firebase_cred = credentials.Certificate(firebase_cred_path)
            firebase_admin.initialize_app(firebase_cred)
            logger.info(f"Firebase Admin SDK initialized with service account: {firebase_cred_path}")
        else:
             logger.warning(f"Firebase service account key not found at {firebase_cred_path}. Trying default credentials.")
             firebase_admin.initialize_app()
             logger.info("Firebase Admin SDK initialized with default credentials (ADC or environment). Potential permission issues if ADC isn't set correctly.")
    except Exception as e:
         logger.warning(f"Failed to initialize Firebase with explicit credentials at {firebase_cred_path}: {e}. Falling back to default credentials.")
         try:
             firebase_admin.initialize_app()
             logger.info("Firebase Admin SDK initialized with default credentials (ADC or environment). Potential permission issues if ADC isn't set correctly.")
         except Exception as default_e:
              logger.error(f"FATAL: Failed to initialize Firebase Admin SDK with both explicit and default credentials: {default_e}")
              # Depending on criticality, you might raise an error here to stop startup

# Create a reusable bearer token auth dependency
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify Firebase ID token and return user details including custom claims."""
    token = credentials.credentials
    logger.info(f"Attempting to verify token: {token[:10]}...") # Log start and part of token
    try:
        decoded_token = auth.verify_id_token(token, clock_skew_seconds=10)
        user_id = decoded_token['uid']
        email = decoded_token.get('email')
        role = decoded_token.get('role')
        groups = decoded_token.get('groups', [])
        logger.info(f"Token verified successfully for user: {user_id}, Role: {role}") # Log success
        return models.User(user_id=user_id, email=email, role=role, groups=groups)
    except Exception as e:
        logger.error(f"Token verification failed: {e}", exc_info=True) # Log the specific error
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# --- Application Lifespan Events ---
@app.on_event("startup")
async def startup_event():
    """Tasks to run when the application starts."""
    logger.info("Application startup: Verifying resources...")
    # Database pool check is implicitly done by init_db_pool() earlier
    if db.db_pool is None:
         logger.error("Database pool failed to initialize during startup!")
         # Potentially raise error to prevent startup
    else:
         logger.info("Database pool initialized.")

    # GCS client check (only if not local dev)
    if not IS_LOCAL_DEV:
        try:
            get_gcs_client() # Attempt to initialize
            logger.info("GCS client check successful (or initialization attempted).")
        except HTTPException as e:
            logger.error(f"Failed GCS client initialization check during startup: {e.detail}")
        except Exception as e:
             logger.error(f"Unexpected error during GCS client check: {e}", exc_info=True)
    else:
         logger.info("Skipping GCS client check in LOCAL_DEV mode.")

@app.on_event("shutdown")
def shutdown_event():
    """Tasks to run when the application shuts down."""
    logger.info("Application shutdown: Cleaning up resources...")
    db.close_db_pool()

# --- Helper to Get Workspace Config --- 
# (You might already have this or similar logic)
def get_workspace_config_from_db(workspace_id: uuid.UUID, db_conn) -> Optional[Dict]:
    """Placeholder: Fetches workspace config from the database."""
    query = """
        SELECT config_chunking_method, config_chunk_size, config_chunk_overlap, config_similarity_metric 
        FROM workspaces WHERE workspace_id = %s
    """
    try:
        with db_conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(query, (str(workspace_id),))
            result = cur.fetchone()
            if result:
                # Convert to dict and map to expected processing pipeline keys if needed
                # Example: 'config_similarity_metric' might map to 'embedding_model'
                # This mapping needs care!
                config = dict(result)
                # Placeholder mapping - Adjust based on your actual schema/needs
                return {
                    "chunking_method": config.get("config_chunking_method", "recursive"),
                    "chunk_size": config.get("config_chunk_size", 1000),
                    "chunk_overlap": config.get("config_chunk_overlap", 200),
                    "embedding_model": config.get("config_similarity_metric", "text-multilingual-embedding-002") # Example mapping!
                }
            else:
                 logger.warning(f"Workspace config not found in DB for ID: {workspace_id}")
                 return None
    except Exception as e:
        logger.error(f"Error fetching workspace config for {workspace_id}: {e}", exc_info=True)
        return None

# --- API Endpoints ---

# --- Root Endpoint ---
@app.get("/", tags=["General"], summary="Root endpoint", description="Simple health check endpoint.")
async def read_root():
    """Returns a simple message indicating the API is running."""
    return {"message": "RAG Backend API is running!"}

# --- Workspace Endpoints ---
tags_workspaces = ["Workspaces"]

@app.post("/api/workspaces",
          response_model=models.WorkspaceResponse,
          status_code=status.HTTP_201_CREATED,
          tags=tags_workspaces,
          summary="Create a new workspace")
async def create_workspace(
    workspace_data: models.WorkspaceCreate,
    current_user: models.User = Depends(get_current_user)
):
    """Creates a new workspace entry in the database. Requires admin role."""
    # --- Role Check --- 
    if not current_user.role or current_user.role.lower() != 'admin':
        logger.warning(f"Forbidden: User {current_user.user_id} (Role: {current_user.role}) attempted to create workspace.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have permission to create workspaces."
        )
    # --- End Role Check ---
    
    owner_user_id = current_user.user_id  # Use the authenticated user's ID

    query = """
        INSERT INTO workspaces (name, owner_user_id, config_chunking_method, config_chunk_size, config_chunk_overlap, config_similarity_metric)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING workspace_id, name, owner_user_id, created_at, config_chunking_method, config_chunk_size, config_chunk_overlap, config_similarity_metric;
    """
    values = (
        workspace_data.name, owner_user_id, workspace_data.config_chunking_method,
        workspace_data.config_chunk_size, workspace_data.config_chunk_overlap,
        workspace_data.config_similarity_metric
    )

    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query, values)
                result = cur.fetchone()
                if not result:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                        detail="Failed to create workspace, no data returned.")
                # Convert row to dict using column names from cursor description
                created_workspace = dict(zip([desc[0] for desc in cur.description], result))
                logger.info(f"Workspace created successfully by admin {current_user.user_id}: {created_workspace['workspace_id']}")
                return models.WorkspaceResponse(**created_workspace) # Validate and return
    except psycopg2.errors.UniqueViolation:
         logger.warning(f"Attempted to create workspace with non-unique attribute for user {owner_user_id}.")
         raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                             detail="Workspace with this name might already exist for this user.")
    # Note: HTTPException and general Exception handling is covered by get_db_session context manager

@app.get("/api/workspaces",
         response_model=List[models.WorkspaceResponse],
         tags=tags_workspaces, 
         summary="List workspaces")
async def list_workspaces(
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0, description="Number of workspaces to skip for pagination"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of workspaces to return")
):
    """
    Retrieves a list of workspaces.
    - Admins see all workspaces.
    - Non-admins see workspaces they own or have access to via group membership.
    """
    workspaces = []
    
    # Base query structure
    base_query = """
        SELECT w.workspace_id, w.name, w.owner_user_id, w.created_at,
               w.config_chunking_method, w.config_chunk_size,
               w.config_chunk_overlap, w.config_similarity_metric
        FROM workspaces w
    """
    
    # Filter based on role
    if current_user.role and current_user.role.lower() == 'admin':
        logger.info(f"Admin user {current_user.user_id} listing all workspaces.")
        query = f"{base_query} ORDER BY w.created_at DESC LIMIT %s OFFSET %s;"
        values = (limit, skip)
    else:
        logger.info(f"User {current_user.user_id} listing workspaces they can access.")
        # Include workspaces the user owns OR has access to via group membership
        query = f"""
            {base_query} 
            WHERE w.owner_user_id = %s 
            OR w.workspace_id IN (
                SELECT wga.workspace_id 
                FROM workspace_group_access wga
                WHERE wga.group_id IN (
                    SELECT ugm.group_id 
                    FROM user_group_memberships ugm 
                    WHERE ugm.user_id = %s
                )
            )
            ORDER BY w.created_at DESC 
            LIMIT %s OFFSET %s;
        """
        values = (current_user.user_id, current_user.user_id, limit, skip)

    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                logger.debug(f"Executing list workspaces query: {cur.mogrify(query, values).decode()}")
                cur.execute(query, values)
                results = cur.fetchall()
                if results:
                    column_names = [desc[0] for desc in cur.description]
                    for row in results:
                        workspaces.append(dict(zip(column_names, row)))
        # Use list comprehension for Pydantic validation (more concise)
        return [models.WorkspaceResponse(**ws) for ws in workspaces]
    except Exception as e: # Catch potential errors before context manager does
        logger.error(f"Unexpected error listing workspaces: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to retrieve workspaces.")


@app.get("/api/workspaces/{workspace_id}",
         response_model=models.WorkspaceResponse,
         tags=tags_workspaces,
         summary="Get a specific workspace by ID")
async def get_workspace(
    workspace_id: uuid.UUID = Path(..., description="The UUID of the workspace to retrieve"),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieves details for a single workspace by its UUID.
    - Admins can retrieve any workspace.
    - Non-admins can retrieve workspaces they own or have access to via group membership.
    """
    workspace_id_str = str(workspace_id) # Convert UUID to string for psycopg2
    
    # Base query structure
    base_query = """
        SELECT w.workspace_id, w.name, w.owner_user_id, w.created_at,
               w.config_chunking_method, w.config_chunk_size,
               w.config_chunk_overlap, w.config_similarity_metric
        FROM workspaces w
        WHERE w.workspace_id = %s
    """
    
    # Determine query and values based on role
    if current_user.role and current_user.role.lower() == 'admin':
        logger.info(f"Admin {current_user.user_id} attempting to retrieve workspace {workspace_id_str}")
        query = f"{base_query};"
        values = (workspace_id_str,)
    else:
        logger.info(f"User {current_user.user_id} attempting to retrieve workspace {workspace_id_str}")
        # Include group access check
        query = f"""
            {base_query}
            AND (
                w.owner_user_id = %s
                OR w.workspace_id IN (
                    SELECT wga.workspace_id 
                    FROM workspace_group_access wga
                    WHERE wga.group_id IN (
                        SELECT ugm.group_id 
                        FROM user_group_memberships ugm 
                        WHERE ugm.user_id = %s
                    )
                )
            );
        """
        values = (workspace_id_str, current_user.user_id, current_user.user_id)

    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                logger.debug(f"Executing get workspace query: {cur.mogrify(query, values).decode()}")
                cur.execute(query, values)
                result = cur.fetchone()
                if not result:
                    # If admin, workspace just doesn't exist. If user, might not exist or no access.
                    detail_msg = f"Workspace with ID {workspace_id_str} not found."
                    if not (current_user.role and current_user.role.lower() == 'admin'):
                        detail_msg = f"Workspace with ID {workspace_id_str} not found or you don't have access."
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail_msg)
                
                # Convert row to dict using column names from cursor description
                workspace_dict = dict(zip([desc[0] for desc in cur.description], result))
                return models.WorkspaceResponse(**workspace_dict) # Validate and return
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error retrieving workspace {workspace_id_str}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                           detail="Failed to retrieve workspace details.")

# --- Document/Upload Endpoints ---
tags_uploads = ["Uploads & Documents"]

# Define allowed file extensions
ALLOWED_FILE_EXTENSIONS = [
    '.txt', '.pdf', '.doc', '.docx', '.html', '.htm', 
    '.csv', '.xls', '.xlsx', '.ppt', '.pptx', '.md',
    '.json', '.xml'
]

@app.post("/api/uploads/direct",
          response_model=List[Dict[str, str]],
          tags=tags_uploads,
          summary="Directly upload multiple files to GCS",
          description="Receives multiple files via multipart/form-data and uploads them directly to GCS.")
async def direct_upload(
    # Accept workspace_id as a string from the form data
    workspace_id_str: str = Form(..., description="The workspace UUID (sent as string form data)."),
    files: List[UploadFile] = File(..., description="The files to upload."),
    current_user: models.User = Depends(get_current_user),
    # Use Optional[Any] to avoid definition-time error when storage is None
    gcs_client: Optional[Any] = Depends(get_gcs_client)
):
    """
    Uploads multiple files.
    If LOCAL_DEV=True, saves files locally and triggers local processing.
    If LOCAL_DEV=False, uploads files directly to Google Cloud Storage.
    
    The files are associated with the specified workspace and the authenticated user.
    Only allows files with extensions commonly used for RAG systems.
    Returns details about each uploaded file and initial processing status.
    """
    # --- ADD VALIDATION/CONVERSION ---
    try:
        workspace_id = uuid.UUID(workspace_id_str)
        logger.info(f"Upload request for workspace: {workspace_id} (from string: '{workspace_id_str}')")
    except ValueError:
        logger.error(f"Invalid workspace_id format received: {workspace_id_str}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Invalid format for workspace_id: '{workspace_id_str}'. Expected UUID.")
    
    # --- Verify workspace access and get config --- 
    workspace_config = None
    try:
        with get_db_session() as conn:
            # Fetch workspace existence, access, and config in one go
            query = """
                SELECT 
                    w.workspace_id, w.config_chunking_method, w.config_chunk_size, 
                    w.config_chunk_overlap, w.config_similarity_metric 
                FROM workspaces w
                LEFT JOIN workspace_group_access wga ON w.workspace_id = wga.workspace_id
                LEFT JOIN user_group_memberships ugm ON wga.group_id = ugm.group_id AND ugm.user_id = %s
                WHERE w.workspace_id = %s 
                AND (w.owner_user_id = %s OR ugm.user_id IS NOT NULL)
                GROUP BY w.workspace_id;
            """
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(query, (current_user.user_id, str(workspace_id), current_user.user_id))
                result = cur.fetchone()
                if not result:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Workspace with ID {workspace_id} not found or you don't have access."
                    )
                # Store fetched config - map DB names to processing names if needed
                workspace_config = {
                    "chunking_method": result.get("config_chunking_method", "recursive"),
                    "chunk_size": result.get("config_chunk_size", 1000),
                    "chunk_overlap": result.get("config_chunk_overlap", 200),
                    "embedding_model": result.get("config_similarity_metric", "text-multilingual-embedding-002")
                }
                logger.info(f"Verified access and fetched config for workspace {workspace_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying workspace access or fetching config: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify workspace access or config."
        )

    if not files or len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided for upload."
        )

    results = []
    
    # --- Define Local Storage Dir (if needed) --- 
    local_workspace_dir = None
    if IS_LOCAL_DEV:
        local_workspace_dir = os.path.join(LOCAL_STORAGE_PATH, str(workspace_id))
        os.makedirs(local_workspace_dir, exist_ok=True)
        logger.info(f"Ensured local directory exists: {local_workspace_dir}")
    
    # Process each file
    for file in files:
        upload_status = "error"
        upload_message = "An unexpected error occurred."
        details = {}
        local_save_path = None

        try:
            filename = file.filename
            content_type = file.content_type
            
            if not filename:
                upload_message = "Filename could not be determined."
                results.append({"filename": "unknown", "status": upload_status, "message": upload_message})
                continue
                
            # Validate file extension
            _, file_extension = os.path.splitext(filename.lower())
            if file_extension not in ALLOWED_FILE_EXTENSIONS:
                upload_message = f"File type {file_extension} not allowed. Allowed types: {', '.join(ALLOWED_FILE_EXTENSIONS)}"
                results.append({"filename": filename, "status": upload_status, "message": upload_message})
                continue
                
            # --- Conditional Upload/Save --- 
            if IS_LOCAL_DEV:
                # --- Save Locally --- 
                local_save_path = os.path.join(local_workspace_dir, filename)
                logger.info(f"Attempting to save file locally to: {local_save_path}")
                try:
                    with open(local_save_path, "wb") as buffer:
                        shutil.copyfileobj(file.file, buffer)
                    logger.info(f"Successfully saved file locally: {local_save_path}")
                    upload_status = "success_local"
                    upload_message = "File saved locally. Triggering processing."
                    details = {"local_path": local_save_path, "content_type": content_type}
                except Exception as save_err:
                    logger.error(f"Failed to save file locally {filename}: {save_err}", exc_info=True)
                    upload_message = f"Failed to save file locally: {save_err}"
                    raise # Re-raise to be caught by outer try/except

            else:
                # --- Upload to GCS --- 
                if not gcs_client:
                    raise ConnectionError("GCS Client is not available for cloud upload.")
                if not GCS_BUCKET_NAME:
                     raise ValueError("GCS_BUCKET_NAME is not configured for cloud upload.")
                    
                object_name = f"{str(workspace_id)}/{filename}" # GCS path structure
                logger.info(f"Attempting to upload file to gs://{GCS_BUCKET_NAME}/{object_name}")
                
                bucket = gcs_client.bucket(GCS_BUCKET_NAME)
                blob = bucket.blob(object_name)
                
                blob.upload_from_file(
                    file.file,
                    content_type=content_type,
                )
                
                # Add metadata (optional but helpful)
                blob.metadata = {
                    "uploaded_by": current_user.user_id,
                    "upload_time": datetime.datetime.now().isoformat(),
                    "original_filename": filename,
                    "workspace_id": str(workspace_id) # Store workspace ID in metadata
                }
                blob.patch()
                
                logger.info(f"Successfully uploaded file to gs://{GCS_BUCKET_NAME}/{object_name}")
                upload_status = "success_gcs"
                upload_message = "File uploaded successfully to GCS."
                details = {"gcs_path": object_name, "content_type": content_type}
                # NOTE: GCS upload automatically triggers the Cloud Run/Function via Pub/Sub
                # No explicit trigger needed here for the cloud path.

            # --- Append result for this file (before potential processing trigger) --- 
            results.append({
                "filename": filename,
                "status": upload_status,
                "message": upload_message,
                **details
            })

            # --- Trigger Local Processing (if applicable) --- 
            if IS_LOCAL_DEV and local_save_path and upload_status == "success_local":
                processing_script_path = os.path.abspath(os.path.join(
                    os.path.dirname(__file__), '..', 'processing', 'main.py'
                ))
                
                # Construct command, adding config overrides from DB
                cmd = [
                    sys.executable, # Use the same python interpreter
                    processing_script_path,
                    '--workspace-id', str(workspace_id),
                    '--input-type', 'local_file',
                    '--file-path', local_save_path
                ]
                # Add overrides if config was fetched and has values
                if workspace_config:
                     if workspace_config.get("embedding_model"):
                         cmd.extend(['--embedding-model', workspace_config["embedding_model"]])
                     if workspace_config.get("chunking_method"):
                          cmd.extend(['--chunking-method', workspace_config["chunking_method"]])
                     if workspace_config.get("chunk_size"):
                          cmd.extend(['--chunk-size', str(workspace_config["chunk_size"])])
                     if workspace_config.get("chunk_overlap"):
                           cmd.extend(['--chunk-overlap', str(workspace_config["chunk_overlap"])])
                           
                logger.info(f"Triggering local processing via subprocess: {' '.join(cmd)}")
                try:
                    # Run synchronously for local dev simplicity. Consider async (e.g., background task) for responsiveness.
                    proc = subprocess.run(
                        cmd, 
                        capture_output=True, 
                        text=True, 
                        check=False, # Don't raise exception on non-zero exit, just log
                        cwd=os.path.dirname(processing_script_path), # Run from processing dir
                        timeout=600 # Add a timeout (10 minutes)
                    )
                    
                    if proc.returncode == 0:
                        logger.info(f"Local processing completed successfully for {filename}.")
                        logger.debug(f"Local processing stdout:\n{proc.stdout}")
                        # Optionally update the status in results dict for this file
                    else:
                        logger.error(f"Local processing failed for {filename} with code {proc.returncode}.")
                        logger.error(f"Stderr: {proc.stderr}")
                        logger.error(f"Stdout: {proc.stdout}")
                        # Optionally update status
                        # Find the result entry for this file and update its message/status
                        for res in results:
                             if res.get("filename") == filename and res.get("local_path") == local_save_path:
                                 res["status"] = "error_processing"
                                 res["message"] = f"File saved locally, but processing failed (code {proc.returncode}). Check backend logs."
                                 break
                                 
                except subprocess.TimeoutExpired:
                     logger.error(f"Local processing timed out for {filename}.")
                     # Update status in results
                     for res in results:
                          if res.get("filename") == filename and res.get("local_path") == local_save_path:
                              res["status"] = "error_processing_timeout"
                              res["message"] = "File saved locally, but processing timed out."
                              break
                except Exception as proc_err:
                    logger.error(f"Error running local processing subprocess for {filename}: {proc_err}", exc_info=True)
                     # Update status in results
                    for res in results:
                         if res.get("filename") == filename and res.get("local_path") == local_save_path:
                             res["status"] = "error_processing"
                             res["message"] = f"Error during local processing: {proc_err}"
                             break
        except Exception as e:
            logger.error(f"Failed processing file {file.filename if file else 'unknown'}: {e}", exc_info=True)
            # Ensure a result entry exists even on error before local save/upload attempt
            found = False
            for res in results:
                if res.get("filename") == file.filename:
                     res["status"] = "error"
                     res["message"] = f"Upload/Processing failed: {e}"
                     found = True
                     break
            if not found and file and file.filename:
                 results.append({
                     "filename": file.filename,
                     "status": "error",
                     "message": f"Upload/Processing failed: {e}"
                 })
                
        finally:
             if file:
                 # Ensure file is closed, crucial for subprocess saving
                 try:
                     await file.close()
                 except Exception as close_err:
                      logger.warning(f"Error closing file {file.filename}: {close_err}")
   
    # Return results of all uploads/saves
    return results

# --- Helper Function for Admin Check ---
def require_admin(current_user: models.User = Depends(get_current_user)):
    """Dependency that raises HTTP 403 if the user is not an admin."""
    if not current_user.role or current_user.role.lower() != 'admin':
        logger.warning(f"Forbidden: Non-admin user {current_user.user_id} attempted admin action.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action."
        )
    return current_user

# --- Admin Group Management Endpoints ---
tags_admin = ["Admin Management"]

@app.post("/api/admin/groups", 
          response_model=models.GroupResponse, 
          tags=tags_admin,
          summary="Create a new user group (Admin Only)")
async def create_group(
    group_data: models.GroupCreate,
    admin_user: models.User = Depends(require_admin) # Ensures user is admin
):
    """Creates a new user group. Requires admin privileges."""
    query = """
        INSERT INTO user_groups (group_name, description)
        VALUES (%s, %s)
        RETURNING group_id, group_name, description, created_at;
    """
    values = (group_data.group_name, group_data.description)
    
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query, values)
                result = cur.fetchone()
                if not result:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                        detail="Failed to create group, no data returned.")
                created_group = dict(zip([desc[0] for desc in cur.description], result))
                logger.info(f"Admin {admin_user.user_id} created group: {created_group['group_name']} ({created_group['group_id']})")
                return models.GroupResponse(**created_group)
    except psycopg2.errors.UniqueViolation:
        logger.warning(f"Admin {admin_user.user_id} attempted to create group with duplicate name: {group_data.group_name}")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Group with name '{group_data.group_name}' already exists.")
    except Exception as e:
        logger.error(f"Error creating group {group_data.group_name}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to create group.")

@app.get("/api/admin/groups", 
         response_model=List[models.GroupResponse], 
         tags=tags_admin,
         summary="List all user groups (Admin Only)")
async def list_groups(
    admin_user: models.User = Depends(require_admin) # Ensures user is admin
):
    """Lists all user groups. Requires admin privileges."""
    query = "SELECT group_id, group_name, description, created_at FROM user_groups ORDER BY group_name;"
    groups = []
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                results = cur.fetchall()
                if results:
                    column_names = [desc[0] for desc in cur.description]
                    for row in results:
                        groups.append(dict(zip(column_names, row)))
        logger.info(f"Admin {admin_user.user_id} listed all groups.")
        return [models.GroupResponse(**g) for g in groups]
    except Exception as e:
        logger.error(f"Error listing groups: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to retrieve groups.")

@app.delete("/api/admin/groups/{group_id}", 
            status_code=status.HTTP_204_NO_CONTENT, 
            tags=tags_admin,
            summary="Delete a user group (Admin Only)")
async def delete_group(
    group_id: uuid.UUID = Path(..., description="The UUID of the group to delete"),
    admin_user: models.User = Depends(require_admin) # Ensures user is admin
):
    """Deletes a user group by its UUID. Requires admin privileges."""
    query = "DELETE FROM user_groups WHERE group_id = %s RETURNING group_id;"
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (str(group_id),))
                result = cur.fetchone()
                if not result:
                    logger.warning(f"Admin {admin_user.user_id} attempted to delete non-existent group ID: {group_id}")
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                        detail=f"Group with ID {group_id} not found.")
                logger.info(f"Admin {admin_user.user_id} deleted group ID: {group_id}")
                # No content is returned on successful DELETE
                return None
    except HTTPException: # Re-raise 404
        raise
    except Exception as e:
        logger.error(f"Error deleting group {group_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to delete group.")

@app.put("/api/admin/users/{user_uid}/groups",
         tags=tags_admin,
         status_code=status.HTTP_204_NO_CONTENT,
         summary="Assign/Update groups for a user (Admin Only)")
async def assign_groups_to_user(
    user_uid: str = Path(..., description="The Firebase UID of the user to modify"),
    assignment: models.UserGroupAssignment = Body(...),
    admin_user: models.User = Depends(require_admin)
):
    """Sets the list of groups a user belongs to. Replaces existing groups. Requires admin privileges."""
    
    # 1. Validate target user exists in Firebase
    try:
        target_user = auth.get_user(user_uid)
    except auth.UserNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with UID {user_uid} not found in Firebase.")
    except Exception as e:
        logger.error(f"Error fetching user {user_uid} from Firebase: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to verify target user.")

    # 2. Validate provided group names exist in the database
    validated_group_ids = {}
    if assignment.group_names:
        # Use psycopg2.extras.execute_values for efficient query if many groups
        query = "SELECT group_name, group_id FROM user_groups WHERE group_name = ANY(%s);"
        try:
            with get_db_session() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (assignment.group_names,))
                    results = cur.fetchall()
                    if len(results) != len(set(assignment.group_names)):
                        found_names = {row[0] for row in results}
                        missing_names = set(assignment.group_names) - found_names
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                            detail=f"Invalid group names provided: {', '.join(missing_names)}")
                    validated_group_ids = {row[0]: row[1] for row in results} # Map name to ID
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Database error validating group names: {e}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to validate groups.")
    
    # 3. Set custom claims in Firebase (preserve existing role)
    try:
        current_claims = target_user.custom_claims or {}
        new_claims = {
            'role': current_claims.get('role'), # Keep existing role
            'groups': assignment.group_names # Set the new list of group names
        }
        auth.set_custom_user_claims(user_uid, new_claims)
        logger.info(f"Admin {admin_user.user_id} set groups for user {user_uid} to: {assignment.group_names}")
    except Exception as e:
        logger.error(f"Failed to set custom claims for user {user_uid}: {e}", exc_info=True)
        # Note: Potential inconsistency if DB update fails below, consider more robust transaction handling
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update user claims in Firebase.")

    # 4. Update user_group_memberships table (Delete old, insert new)
    delete_query = "DELETE FROM user_group_memberships WHERE user_id = %s;"
    insert_query = "INSERT INTO user_group_memberships (user_id, group_id) VALUES (%s, %s);"
    
    try:
        with get_db_session() as conn: # Uses context manager for commit/rollback
            with conn.cursor() as cur:
                # Delete existing memberships for the user
                cur.execute(delete_query, (user_uid,))
                logger.debug(f"Deleted old group memberships for user {user_uid}")
                
                # Insert new memberships if any groups were assigned
                if validated_group_ids:
                    insert_values = [(user_uid, group_id) for group_id in validated_group_ids.values()]
                    psycopg2.extras.execute_batch(cur, insert_query, insert_values)
                    logger.debug(f"Inserted new group memberships for user {user_uid}")
        logger.info(f"Successfully updated database group memberships for user {user_uid}")
        return None # Return 204 No Content
    except Exception as e:
        logger.error(f"Database error updating user_group_memberships for {user_uid}: {e}", exc_info=True)
        # Claims were set, but DB failed - this is an inconsistency!
        # Ideally, use a more transactional approach or flag the user for reconciliation
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to update group memberships in database after claims were set.")


@app.put("/api/admin/workspaces/{workspace_id}/groups",
         tags=tags_admin,
         status_code=status.HTTP_204_NO_CONTENT,
         summary="Assign groups that can access a workspace (Admin Only)")
async def assign_groups_to_workspace(
    workspace_id: uuid.UUID = Path(..., description="The UUID of the workspace to modify"),
    assignment: models.WorkspaceGroupAssignment = Body(...),
    admin_user: models.User = Depends(require_admin)
):
    """Sets the list of groups that have access to a specific workspace. Replaces existing assignments."""
    
    # 1. Validate workspace exists
    ws_check_query = "SELECT workspace_id FROM workspaces WHERE workspace_id = %s;"
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(ws_check_query, (str(workspace_id),))
                if not cur.fetchone():
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace with ID {workspace_id} not found.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database error checking workspace {workspace_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to verify workspace.")

    # 2. Validate group IDs exist (optional but good practice)
    if assignment.group_ids:
        group_check_query = "SELECT group_id FROM user_groups WHERE group_id = ANY(%s::uuid[]);"
        try:
            with get_db_session() as conn:
                with conn.cursor() as cur:
                    # Convert UUIDs to strings for the query parameter array
                    group_id_strs = [str(gid) for gid in assignment.group_ids]
                    cur.execute(group_check_query, (group_id_strs,))
                    results = cur.fetchall()
                    if len(results) != len(set(assignment.group_ids)):
                         found_ids = {uuid.UUID(row[0]) for row in results}
                         missing_ids = set(assignment.group_ids) - found_ids
                         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                             detail=f"Invalid group IDs provided: {', '.join(map(str, missing_ids))}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Database error validating group IDs: {e}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to validate groups.")

    # 3. Update workspace_group_access table (Delete old, insert new)
    delete_query = "DELETE FROM workspace_group_access WHERE workspace_id = %s;"
    insert_query = "INSERT INTO workspace_group_access (workspace_id, group_id) VALUES (%s, %s);"
    
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(delete_query, (str(workspace_id),))
                logger.debug(f"Deleted old group access for workspace {workspace_id}")
                
                if assignment.group_ids:
                    insert_values = [(str(workspace_id), str(group_id)) for group_id in assignment.group_ids]
                    psycopg2.extras.execute_batch(cur, insert_query, insert_values)
                    logger.debug(f"Inserted new group access for workspace {workspace_id}")
        logger.info(f"Admin {admin_user.user_id} updated group access for workspace {workspace_id} to groups: {assignment.group_ids}")
        return None # Return 204 No Content
    except Exception as e:
        logger.error(f"Database error updating workspace_group_access for {workspace_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to update workspace group access in database.")

@app.get("/api/admin/users",
         response_model=List[models.UserAdminView],
         tags=tags_admin,
         summary="List all Firebase users (Admin Only)")
async def list_all_users(
    admin_user: models.User = Depends(require_admin)
):
    """Lists all users from Firebase Authentication, including their custom claims."""
    users = []
    try:
        # Iterate through all users. This could be slow for many users.
        # Consider pagination for production: list_users(page_token=next_page_token)
        for user_record in auth.list_users().iterate_all():
            claims = user_record.custom_claims or {}
            users.append(models.UserAdminView(
                user_id=user_record.uid,
                email=user_record.email,
                disabled=user_record.disabled,
                last_sign_in=user_record.user_metadata.last_sign_in_timestamp / 1000.0 if user_record.user_metadata and user_record.user_metadata.last_sign_in_timestamp else None,
                created=user_record.user_metadata.creation_timestamp / 1000.0 if user_record.user_metadata and user_record.user_metadata.creation_timestamp else None,
                role=claims.get('role'),
                groups=claims.get('groups', [])
            ))
        logger.info(f"Admin {admin_user.user_id} listed all Firebase users.")
        return users
    except Exception as e:
        logger.error(f"Failed to list Firebase users: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve user list from Firebase.")

@app.put("/api/admin/users/{user_uid}/role", 
         tags=tags_admin,
         status_code=status.HTTP_204_NO_CONTENT,
         summary="Set role for a user (Admin Only)")
async def set_user_role(
    user_uid: str = Path(..., description="The Firebase UID of the user to modify"),
    admin_user: models.User = Depends(require_admin), # Dependency first
    role_data: models.UserRoleAssignment = Body(...)   # Body parameter last
):
    """Sets the role (e.g., 'admin' or 'user') for a specific user. Requires admin privileges."""
    
    # Validate target user exists
    try:
        target_user = auth.get_user(user_uid)
    except auth.UserNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with UID {user_uid} not found in Firebase.")
    except Exception as e:
        logger.error(f"Error fetching user {user_uid} from Firebase: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to verify target user.")
        
    # Validate the role being assigned (allow None/null to clear role)
    new_role = role_data.role
    if new_role and new_role.lower() not in ['admin', 'user']: # Example roles
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role '{new_role}' specified. Allowed roles: admin, user, or null to clear.")

    # Set custom claims (preserve existing groups)
    try:
        current_claims = target_user.custom_claims or {}
        new_claims = {
            'role': new_role.lower() if new_role else None, # Store lowercase or None
            'groups': current_claims.get('groups', []) # Keep existing groups
        }
        # Remove role key if setting to None
        if new_claims['role'] is None:
            del new_claims['role']
            
        auth.set_custom_user_claims(user_uid, new_claims)
        logger.info(f"Admin {admin_user.user_id} set role for user {user_uid} to: {new_role}")
        return None # 204 No Content
    except Exception as e:
        logger.error(f"Failed to set custom claims for user {user_uid}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update user claims in Firebase.")

@app.get("/api/admin/workspaces/{workspace_id}/groups",
         response_model=models.WorkspaceGroupAssignment, # Re-use the model for structure
         tags=tags_admin,
         summary="Get groups assigned to a specific workspace (Admin Only)")
async def get_workspace_groups(
    workspace_id: uuid.UUID = Path(..., description="The UUID of the workspace"),
    admin_user: models.User = Depends(require_admin)
):
    """Retrieves the list of group IDs assigned to a specific workspace."""
    query = "SELECT group_id FROM workspace_group_access WHERE workspace_id = %s;"
    group_ids = []
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (str(workspace_id),))
                results = cur.fetchall()
                if results:
                    group_ids = [row[0] for row in results] # Fetchall returns tuples
        logger.info(f"Admin {admin_user.user_id} retrieved groups for workspace {workspace_id}: {group_ids}")
        # We need to return in the format expected by WorkspaceGroupAssignment, which expects a list of UUIDs
        return models.WorkspaceGroupAssignment(group_ids=group_ids)
    except Exception as e:
        # Check if workspace itself exists, maybe add a check before this query? Good practice.
        ws_check_query = "SELECT 1 FROM workspaces WHERE workspace_id = %s;"
        try:
            with get_db_session() as conn:
                with conn.cursor() as cur:
                    cur.execute(ws_check_query, (str(workspace_id),))
                    if not cur.fetchone():
                         logger.warning(f"Admin {admin_user.user_id} tried to get groups for non-existent workspace {workspace_id}")
                         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace with ID {workspace_id} not found.")
        except HTTPException: # Re-raise 404
             raise
        except Exception as check_err:
             logger.error(f"Error checking workspace existence for {workspace_id} during group retrieval: {check_err}", exc_info=True)
             # Fall through to general error if check fails

        logger.error(f"Error retrieving groups for workspace {workspace_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to retrieve groups for workspace.")

@app.get("/api/admin/workspace-group-assignments",
         response_model=List[models.WorkspaceGroupAccessEntry],
         tags=tags_admin,
         summary="Get all workspace-group assignments (Admin Only)")
async def get_all_workspace_group_assignments(
    admin_user: models.User = Depends(require_admin)
):
    """Retrieves all (workspace_id, group_id) pairs from the access table."""
    query = "SELECT workspace_id, group_id FROM workspace_group_access;"
    assignments = []
    try:
        with get_db_session() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                results = cur.fetchall()
                if results:
                    # Convert rows to the Pydantic model format
                    assignments = [models.WorkspaceGroupAccessEntry(workspace_id=row[0], group_id=row[1]) for row in results]
        logger.info(f"Admin {admin_user.user_id} retrieved all workspace-group assignments.")
        return assignments
    except Exception as e:
        logger.error(f"Error retrieving all workspace-group assignments: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to retrieve workspace-group assignments.")

# --- Add the query endpoint ---
@app.post("/api/query",
          # response_model removed for streaming
          tags=["Queries"],
          summary="Query the RAG system (Streaming)")
async def query_documents_stream( # Renamed
    query_data: Dict[str, Any] = Body(..., description="Query data including text, workspace ID, and optional history"),
    current_user: models.User = Depends(get_current_user)
):
    """
    Process a query against a workspace's documents using the RAG system.
    Accepts optional chat history for context.
    Streams the response back to the client.
    """
    try:
        # Extract and validate required fields
        if 'query' not in query_data or not query_data['query'].strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query text is required")
        if 'workspace_id' not in query_data or not query_data['workspace_id']:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id is required")
        
        try:
            workspace_id = str(uuid.UUID(query_data['workspace_id']))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid workspace_id format: {query_data['workspace_id']}")

        # Verify workspace access (using a context manager for the session)
        connection_string = None
        try:
            with get_db_session() as conn:
                access_query = """
                    SELECT 1 FROM workspaces w
                    LEFT JOIN workspace_group_access wga ON w.workspace_id = wga.workspace_id
                    LEFT JOIN user_group_memberships ugm ON wga.group_id = ugm.group_id AND ugm.user_id = %s
                    WHERE w.workspace_id = %s AND (w.owner_user_id = %s OR ugm.user_id IS NOT NULL) LIMIT 1;
                """
                with conn.cursor() as cur:
                    cur.execute(access_query, (current_user.user_id, workspace_id, current_user.user_id))
                    if not cur.fetchone():
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace not found or you don't have access")
            
            # Get database connection string *after* session is closed
            if IS_LOCAL_DEV:
                db_user = os.getenv('DB_USER')
                db_password = os.getenv('DB_PASSWORD')
                db_host = os.getenv('DB_HOST', 'localhost')
                db_port = os.getenv('DB_PORT', '5432')
                db_name = os.getenv('DB_NAME')
                if not all([db_user, db_password, db_host, db_name]):
                    raise HTTPException(status_code=500, detail="Local DB config incomplete")
                connection_string = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
            else:
                connection_string = os.getenv('DATABASE_URL')
                if not connection_string:
                    raise HTTPException(status_code=500, detail="DATABASE_URL not configured")

        except HTTPException as http_ex:
            raise http_ex # Re-raise permission/not found errors
        except Exception as db_err:
            logger.error(f"Database error during workspace access/config: {db_err}", exc_info=True)
            raise HTTPException(status_code=500, detail="Database error during setup.")

        # Set defaults and overrides
        embedding_model = query_data.get('embedding_model', 'text-multilingual-embedding-002')
        top_k = query_data.get('top_k', 4)
        # Let get_llm handle the default logic based on env var or fallback
        llm_model = query_data.get('model', None) 
        chat_history = query_data.get('chat_history', [])
        temperature = query_data.get('temperature', 0.2)
        
        # Correctly check if the imported function is available
        if not process_query_stream:
            logger.error("process_query_stream function is not available (import likely failed).")
            raise HTTPException(status_code=501, detail="Streaming query function unavailable.")

        # Define the async generator for streaming
        async def stream_generator():
            try:
                logger.info(f"Starting stream for query '{query_data['query'][:30]}...' in workspace {workspace_id}")
                # Call the imported function directly
                stream = process_query_stream(
                    query=query_data['query'],
                    workspace_id=workspace_id,
                    connection_string=connection_string,
                    embedding_model_name=embedding_model,
                    model_name=llm_model,
                    top_k=top_k,
                    chat_history=chat_history,
                    temperature=temperature
                )
                async for chunk in stream:
                    yield chunk
                logger.info(f"Finished stream for query '{query_data['query'][:30]}...' in workspace {workspace_id}")
            except Exception as stream_err:
                logger.error(f"Error during response streaming: {stream_err}", exc_info=True)
                yield f"\n\nStream Error: {stream_err}" 
        
        # Return the StreamingResponse
        return StreamingResponse(stream_generator(), media_type="text/plain")

    except HTTPException as http_ex:
        logger.error(f"HTTP Exception in query stream endpoint: {http_ex.detail}")
        raise http_ex
    except Exception as e:
        logger.error(f"Unexpected error setting up query stream: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to initiate query stream: {str(e)}")

# --- End of file ---
