import os
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
import logging

# Load environment variables from .env file (especially for local dev)
# Now expects the .env to be in the parent directory (project root)
_DOTENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
if os.path.exists(_DOTENV_PATH):
    load_dotenv(dotenv_path=_DOTENV_PATH)
    print(f"db.py: Loaded environment variables from: {_DOTENV_PATH}")
else:
     print(f"db.py: Root .env file not found at {_DOTENV_PATH}, relying on environment.")

logger = logging.getLogger(__name__)

# --- Configuration (Read AFTER loading .env) --- 
# Check if running in local development mode via an env var
IS_LOCAL_DEV = os.getenv("LOCAL_DEV", "false").lower() in ('true', 'yes', '1')
logger.info(f"db.py: IS_LOCAL_DEV={IS_LOCAL_DEV}")

# Cloud SQL specific vars (still load them)
USE_SOCKET = os.getenv("USE_SOCKET", "false").lower() in ('true', 'yes', '1')
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME")
DB_SOCKET_DIR = os.getenv("DB_SOCKET_DIR", "/cloudsql")

# Initialize pool variable
db_pool = None

def get_connection_params() -> dict:
    """Determines the correct database connection parameters based on mode."""
    params = {
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME")
    }
    if not all([params["user"], params["password"], params["database"]]):
        raise ValueError("Missing required DB environment variables (DB_USER, DB_PASSWORD, DB_NAME)")
 
    if IS_LOCAL_DEV:
        # LOCAL DEVELOPMENT: Explicitly use localhost or value from .env, default to localhost.
        params["host"] = os.getenv("DB_HOST", "localhost") # Keep reading from .env if set
        params["port"] = os.getenv("DB_PORT", "5432")
        # FORCE localhost if IS_LOCAL_DEV is true, making it more robust
        # params["host"] = "localhost" 
        # params["port"] = "5432" 
        # ^^^ Alternative: Uncomment above two lines and comment out the two below if you ALWAYS want localhost:5432 for local dev.
        logger.info(f"Local DB Config: Host={params['host']}, Port={params['port']}, DB={params['database']}, User={params['user']}")
    else:
        # CLOUD DEPLOYMENT: Use socket or TCP based on USE_SOCKET
        if USE_SOCKET:
            if not INSTANCE_CONNECTION_NAME:
                 raise ValueError("INSTANCE_CONNECTION_NAME is required when USE_SOCKET is true")
            socket_path = f"{DB_SOCKET_DIR}/{INSTANCE_CONNECTION_NAME}"
            params["host"] = socket_path
            logger.info(f"Cloud DB Config (Socket): Path={params['host']}, DB={params['database']}, User={params['user']}")
        else:
            # Use TCP for cloud if socket not specified (e.g., direct connection)
            params["host"] = os.getenv("DB_HOST")
            params["port"] = os.getenv("DB_PORT", "5432")
            if not params["host"]:
                 raise ValueError("DB_HOST is required for cloud TCP connection")
            logger.info(f"Cloud DB Config (TCP): Host={params['host']}, Port={params['port']}, DB={params['database']}, User={params['user']}")

    return params

def init_db_pool():
    """Initializes the database connection pool based on the environment."""
    global db_pool
    if db_pool:
        logger.info("Database pool already initialized.")
        return
        
    try:
        conn_params = get_connection_params()
        logger.info(f"Initializing DB pool with params: { {k: v for k, v in conn_params.items() if k != 'password'} }") # Log params except password
        
        # Create a connection pool using determined parameters
        db_pool = psycopg2.pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10, # Adjust max connections based on expected load
            **conn_params
        )
        logger.info(f"Database connection pool created successfully.")

    except (Exception, psycopg2.DatabaseError) as error:
        logger.error(f"Error while connecting to PostgreSQL and creating pool: {error}", exc_info=True)
        db_pool = None # Ensure pool is None if connection fails
        raise ConnectionError(f"Failed to initialize database pool: {error}") from error

def get_db_connection():
    """Gets a connection from the pool."""
    if db_pool is None:
        # Attempt to initialize if not already done (e.g., if accessed before FastAPI startup event)
        logger.warning("Database pool was not initialized. Attempting initialization now.")
        init_db_pool()
        if db_pool is None:
             raise ConnectionError("Database connection pool is not available after attempting initialization.")
             
    conn = db_pool.getconn()
    try:
        # Setting autocommit to False is generally preferred for web applications
        # where transactions are managed per request.
        conn.autocommit = False
        return conn
    except Exception as e:
        # If setting autocommit fails, return the connection to the pool before raising
        logger.error(f"Error setting connection properties: {e}")
        db_pool.putconn(conn)
        raise

def release_db_connection(conn):
    """Releases a connection back to the pool."""
    if db_pool:
        db_pool.putconn(conn)

def close_db_pool():
    """Closes all connections in the pool."""
    if db_pool:
        db_pool.closeall()
        logger.info("Database connection pool closed.")