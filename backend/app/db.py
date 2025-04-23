import os
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
import logging

# Load environment variables from .env file (especially for local dev)
load_dotenv()

logger = logging.getLogger(__name__)

try:
    # Create a connection pool
    db_pool = psycopg2.pool.SimpleConnectionPool(
        minconn=1,
        maxconn=10, # Adjust max connections based on expected load
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "postgres") # Assuming default 'postgres' db for now
                                                # Or create a dedicated DB if you prefer
    )
    logger.info("Database connection pool created successfully.")

except (Exception, psycopg2.DatabaseError) as error:
    logger.error(f"Error while connecting to PostgreSQL: {error}", exc_info=True)
    db_pool = None # Ensure pool is None if connection fails

def get_db_connection():
    """Gets a connection from the pool."""
    if db_pool is None:
        raise ConnectionError("Database connection pool is not available.")
    conn = db_pool.getconn()
    try:
        # Set autocommit to True for simplicity in simple operations,
        # or manage transactions explicitly (conn.commit(), conn.rollback())
        # For FastAPI, managing transactions per request is often better.
        # conn.autocommit = True
        conn.autocommit = False # Let's manage transactions explicitly
        return conn
    except:
        db_pool.putconn(conn) # Return connection if setting autocommit fails
        raise

def release_db_connection(conn):
    """Releases a connection back to the pool."""
    if db_pool is None:
        return # Pool doesn't exist
    db_pool.putconn(conn)

# Optional: Function to close the pool when the application shuts down
def close_db_pool():
    if db_pool:
        db_pool.closeall()
        logger.info("Database connection pool closed.")