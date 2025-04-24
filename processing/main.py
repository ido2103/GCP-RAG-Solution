import os
import sys
import logging
import argparse
import importlib
import yaml
import json
import shutil
from typing import Dict, Any, List, Optional
import uuid
import tempfile
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_env_vars(env_file_path: Optional[str] = None):
    """
    Load environment variables from a .env file.
    Prioritizes specified path, then current dir, then parent dir (project root).
    """
    loaded_path = None
    if env_file_path:
        if os.path.exists(env_file_path):
            load_dotenv(dotenv_path=env_file_path, override=False)
            loaded_path = env_file_path
        else:
             logger.warning(f"Specified --env-file not found: {env_file_path}")

    if not loaded_path:
        # Try current dir, then parent dir relative to this script
        if load_dotenv(override=False): # Checks .env in cwd
            loaded_path = ".env (in current dir)"
        else:
            project_root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
            if os.path.exists(project_root_env):
                if load_dotenv(dotenv_path=project_root_env, override=False):
                    loaded_path = project_root_env
    
    if loaded_path:
        logger.info(f"Loaded environment variables from: {loaded_path}")
    else:
         logger.info("No .env file found or loaded from default locations or specified path.")

def load_workflow_config(config_path: str) -> Dict[str, Any]:
    """
    Load the workflow configuration from a YAML file.
    
    Args:
        config_path: Path to the workflow YAML file.
    
    Returns:
        Dictionary with workflow configuration.
    """
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        logger.info(f"Loaded workflow configuration from {config_path}")
        return config
    
    except Exception as e:
        logger.error(f"Error loading workflow configuration: {str(e)}")
        raise

def resolve_variable(value: str, context: Dict[str, Any]) -> Any:
    """
    Resolve a variable reference in the format "${variable.path}".
    
    Args:
        value: The variable reference string.
        context: The context dictionary containing variable values.
    
    Returns:
        The resolved value.
    """
    if not isinstance(value, str) or not value.startswith("${") or not value.endswith("}"):
        return value
    
    # Extract the variable path
    var_path = value[2:-1].split(".")
    
    # Navigate the context dictionary
    current = context
    try:
        for key in var_path:
            if isinstance(current, dict):
                current = current[key]
            else:
                raise KeyError(f"Cannot access key '{key}' on non-dict item")
        return current
    except KeyError:
        raise ValueError(f"Variable reference '{value}' not found in context")
    except Exception as e:
        raise ValueError(f"Error resolving variable '{value}': {e}")

def resolve_variables_in_dict(data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively resolve variable references in a dictionary.
    
    Args:
        data: The dictionary containing variable references.
        context: The context dictionary containing variable values.
    
    Returns:
        Dictionary with resolved variables.
    """
    result = {}
    
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = resolve_variables_in_dict(value, context)
        elif isinstance(value, list):
            result[key] = [
                resolve_variables_in_dict(item, context) if isinstance(item, dict)
                else resolve_variable(item, context) if isinstance(item, str)
                else item
                for item in value
            ]
        elif isinstance(value, str):
            result[key] = resolve_variable(value, context)
        else:
            result[key] = value
    
    return result

def import_function(module_path: str, function_name: str):
    """
    Dynamically import a function from a module.
    
    Args:
        module_path: The path to the module.
        function_name: The name of the function to import.
    
    Returns:
        The imported function.
    """
    # Adjust module path if it's one of the subdirectories
    if module_path.startswith(("extract_text.", "chunk_text.", "embed_text.", "store_data.", "query.")):
        full_module_path = f"processing.{module_path}"
    else:
        full_module_path = module_path
        
    try:
        # Ensure the parent directory is in sys.path if running as script
        processing_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(processing_dir) # Assumes processing is one level down
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
            
        module = importlib.import_module(full_module_path)
        if not hasattr(module, function_name):
            raise ImportError(f"Function '{function_name}' not found in module '{full_module_path}'")
        
        return getattr(module, function_name)
    
    except ModuleNotFoundError as e:
        logger.error(f"Module '{full_module_path}' not found. Ensure it's installed and accessible. Error: {e}")
        raise
    except Exception as e:
        logger.error(f"Error importing function '{function_name}' from module '{full_module_path}': {str(e)}")
        raise

def create_directories_for_file(file_path: str):
    """
    Create directories for a file path if they don't exist.
    
    Args:
        file_path: The path to the file.
    """
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        logger.info(f"Created directory: {directory}")

def run_workflow(config: Dict[str, Any], cli_args: Dict[str, Any]):
    """
    Run the workflow defined in the configuration.
    
    Args:
        config: The workflow configuration dictionary.
        cli_args: Dictionary of command-line arguments to override configuration.
    """
    # Load environment variables (e.g., for API keys, DB credentials)
    load_env_vars(cli_args.get('env_file')) # Pass env_file path if provided
    IS_LOCAL_DEV = os.getenv("LOCAL_DEV", "false").lower() == "true"
    logger.info(f"Processing Workflow: IS_LOCAL_DEV={IS_LOCAL_DEV}")

    # Create a context with all variables
    context = {
        "defaults": config.get("defaults", {}),
        "input": config.get("input", {}),
        "persistent_outputs": config.get("persistent_outputs", {}),
        "env": dict(os.environ) # Include environment variables in context
    }
    
    # --- Override context with CLI arguments --- 
    # Specific handling for input_type to map to context['input']['type']
    cli_input_type = cli_args.pop('input_type', None) # Get and remove input_type from cli_args
    if cli_input_type:
        context["input"]["type"] = cli_input_type
        logger.info(f"Overriding input 'type' with CLI value: {cli_input_type}")

    # General overrides for other args
    for key, value in cli_args.items():
        if value is not None:
            if key in context["defaults"]:
                context["defaults"][key] = value
                logger.info(f"Overriding default '{key}' with CLI value: {value}")
            # Also allow overriding input keys like file_path, directory_path, etc.
            elif key in context["input"]:
                context["input"][key] = value
                logger.info(f"Overriding input '{key}' with CLI value: {value}")
            else:
                 if key == 'connection_string' and 'store_data' in [s['name'] for s in config.get("steps", [])]:
                     logger.info(f"Setting database connection string from CLI.")
                     context["defaults"]["db_connection_string"] = value
                 else:
                     # Keep the warning for unhandled CLI args
                     logger.warning(f"CLI argument '{key}' not found in defaults or input, ignoring.")
    # --- End CLI Overrides ---
    
    # Resolve variables within the persistent_outputs section first
    context["persistent_outputs"] = resolve_variables_in_dict(context["persistent_outputs"], context)
    
    # Create directories for persistent output files
    output_paths = list(context["persistent_outputs"].values()) if context["persistent_outputs"] else []
    output_dir_base = os.path.commonpath(output_paths) if output_paths else None
    if output_dir_base:
        os.makedirs(os.path.dirname(output_dir_base), exist_ok=True)
        logger.info(f"Ensured base persistent output directory exists: {os.path.dirname(output_dir_base)}")

    # Run each step in the workflow
    steps = config.get("steps", [])
    step_outputs = {}
    db_connection_string = context["defaults"].get("db_connection_string") # Get from CLI override or env

    # --- Determine DB Connection String --- 
    db_connection_string_cli = cli_args.get("connection_string") # Get from CLI override
    db_connection_string_env = os.getenv("DATABASE_URL")
    db_connection_string = db_connection_string_cli # Prioritize CLI

    if not db_connection_string:
         if IS_LOCAL_DEV:
             # Construct local connection string from DB_* vars
             db_user = os.getenv("DB_USER")
             db_password = os.getenv("DB_PASSWORD")
             db_host = os.getenv("DB_HOST", "localhost")
             db_port = os.getenv("DB_PORT", "5432")
             db_name = os.getenv("DB_NAME")
             if all([db_user, db_password, db_host, db_name]):
                 db_connection_string = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
                 logger.info("Using local DB connection string constructed from DB_* vars.")
             elif db_connection_string_env:
                  db_connection_string = db_connection_string_env # Fallback to DATABASE_URL if DB_* missing
                  logger.info("Using local DB connection string from DATABASE_URL env var.")
             else:
                  logger.warning("Local DB connection details not found (DATABASE_URL or DB_USER/PASS/HOST/NAME).")
                  # Let store_data step fail if it needs DB
         else:
             # Construct cloud connection string (prefer socket)
             use_socket = os.getenv("USE_SOCKET", "false").lower() == "true"
             instance_connection_name = os.getenv("INSTANCE_CONNECTION_NAME")
             db_user = os.getenv("DB_USER")
             db_password = os.getenv("DB_PASSWORD")
             db_name = os.getenv("DB_NAME")
             db_socket_dir = os.getenv("DB_SOCKET_DIR", "/cloudsql")
             db_host = os.getenv("DB_HOST")
             db_port = os.getenv("DB_PORT", "5432")

             if use_socket and instance_connection_name and db_user and db_password and db_name:
                 db_connection_string = f"postgresql://{db_user}:{db_password}@/{db_name}?host={db_socket_dir}/{instance_connection_name}"
                 logger.info("Using cloud DB connection string via socket.")
             elif db_host and db_user and db_password and db_name:
                  db_connection_string = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
                  logger.info("Using cloud DB connection string via TCP.")
             elif db_connection_string_env:
                  db_connection_string = db_connection_string_env # Fallback to DATABASE_URL
                  logger.info("Using cloud DB connection string from DATABASE_URL env var.")
             else:
                  logger.warning("Cloud DB connection details not found.")
                  # Let store_data step fail if it needs DB

    for i, step in enumerate(steps):
        step_name = step.get("name")
        if not step.get("enabled", True):
            logger.info(f"Skipping disabled step: {step_name}")
            continue
        
        logger.info(f"--- Running Step {i+1}/{len(steps)}: {step_name} ---")
        
        # Resolve step-specific parameters using the current context
        step_params = step.get("params", {})
        resolved_params = resolve_variables_in_dict(step_params, context)
        
        # Resolve input/output file paths for the step
        input_file = None
        if "input" in step:
            input_file = resolve_variable(step["input"], context)
        
        output_file = None
        if "output" in step:
            output_file = resolve_variable(step["output"], context)
            create_directories_for_file(output_file) # Ensure output dir exists
        
        # --- Import Module and Function --- 
        module_path = step.get("module")
        function_name = step.get("function") # Default function if not input-type specific
        
        # --- Prepare Function Arguments --- 
        func_args = []
        func_kwargs = dict(resolved_params) # Start with resolved params
        result = None

        # --- Execute Step Logic --- 
        try:
            if step_name == "extract_text":
                input_config = context["input"]
                # Use the (potentially overridden) input type from context
                input_type = input_config.get("type") 
                
                if input_type == "gcs":
                    if not input_config.get("bucket_name") or not input_config.get("object_name"):
                        raise ValueError("bucket_name and object_name are required for GCS input")
                    func = import_function(module_path, "process_gcs_file")
                    func_args = [input_config["bucket_name"], input_config["object_name"]]
                elif input_type == "local_file":
                    if not input_config.get("file_path"):
                        raise ValueError("file_path is required for local_file input")
                    func = import_function(module_path, "extract_text_from_file")
                    func_args = [input_config["file_path"]]
                elif input_type == "local_dir":
                    if not input_config.get("directory_path"):
                        raise ValueError("directory_path is required for local_dir input")
                    func = import_function(module_path, "extract_text_from_directory")
                    func_args = [input_config["directory_path"], input_config.get("recursive", True)]
                else:
                    raise ValueError(f"Unsupported input type: {input_type}")
                
                # Execute the extraction function
                result = func(*func_args)
            
            elif step_name == "chunk_text":
                func = import_function(module_path, "chunk_documents")
                input_data = import_function(module_path, "load_documents_from_json")(input_file)
                func_args = [input_data]
                # Pass resolved params as kwargs
                result = func(*func_args, **func_kwargs)
            
            elif step_name == "embed_text":
                func = import_function(module_path, "embed_documents")
                input_data = import_function(module_path, "load_documents_from_json")(input_file)
                func_args = [input_data]
                # Pass resolved params as kwargs
                result = func(*func_args, **func_kwargs)
            
            elif step_name == "store_data":
                func = import_function(module_path, "store_embedded_documents")
                input_data = import_function(module_path, "load_embedded_documents_from_json")(input_file)
                
                if not db_connection_string:
                     raise ValueError("Database connection string could not be determined for store_data step.")

                # Pass connection string explicitly
                func_kwargs["connection_string"] = db_connection_string 
                
                # Ensure workspace_id is present
                if "workspace_id" not in func_kwargs:
                    raise ValueError(f"workspace_id is required for step {step_name}")

                # Call store_embedded_documents
                result = func(input_data, **func_kwargs)
            
            else:
                 logger.warning(f"Step '{step_name}' has no specific execution logic defined. Skipping.")
                 continue

            # --- Output Handling --- 
            if output_file and result:
                logger.info(f"Saving output of step '{step_name}' to {output_file}")
                # Handle different result types for saving
                try:
                    if step_name in ["extract_text", "chunk_text"] and isinstance(result, list):
                         # Langchain Document objects
                        serializable_docs = [{"text": doc.page_content, "metadata": doc.metadata} for doc in result]
                        with open(output_file, 'w', encoding='utf-8') as f:
                            json.dump(serializable_docs, f, ensure_ascii=False, indent=2)
                    elif step_name == "embed_text" and isinstance(result, list):
                         # List of dicts with numpy arrays
                        serializable_docs = []
                        for doc in result:
                             embedding = doc["embedding"]
                             serializable_doc = {
                                "text": doc["text"],
                                "metadata": doc["metadata"],
                                "embedding": embedding.tolist() if hasattr(embedding, "tolist") else embedding
                             }
                             serializable_docs.append(serializable_doc)
                        with open(output_file, 'w', encoding='utf-8') as f:
                             json.dump(serializable_docs, f, ensure_ascii=False, indent=2)
                    # Add other result types if needed
                    else:
                         # Try generic JSON dump for other types (like store_data count)
                         with open(output_file, 'w', encoding='utf-8') as f:
                            json.dump(result, f, ensure_ascii=False, indent=2)
                except Exception as save_err:
                    logger.error(f"Failed to save output for step '{step_name}' to {output_file}: {save_err}")
            
            # Store the result in context for potential use by subsequent steps (optional)
            step_outputs[step_name] = result # Be cautious with large results
            logger.info(f"--- Step {step_name} completed successfully ---")

        except Exception as step_err:
             logger.error(f"!!! Error executing step '{step_name}': {step_err}", exc_info=True)
             raise # Stop workflow on error
    
    # --- Cleanup --- 
    cleanup_config = resolve_variables_in_dict(config.get("cleanup", {}), context)
    # Default to NOT removing files in local dev unless explicitly set to true in config
    should_remove_output = cleanup_config.get("remove_temp_files", not IS_LOCAL_DEV)
    if should_remove_output:
        logger.info("Cleaning up intermediate/output files...")
        files_to_remove = context["persistent_outputs"].values()
        for output_file in files_to_remove:
            if os.path.exists(output_file):
                try:
                    os.remove(output_file)
                    logger.info(f"Removed output file: {output_file}")
                except OSError as remove_err:
                    logger.warning(f"Could not remove output file {output_file}: {remove_err}")
        # Optionally remove the output directory itself if empty
        if output_dir_base and os.path.exists(output_dir_base) and not os.listdir(output_dir_base):
             try:
                 shutil.rmtree(output_dir_base)
                 logger.info(f"Removed empty persistent output directory: {output_dir_base}")
             except OSError as rmdir_err:
                  logger.warning(f"Could not remove persistent output directory {output_dir_base}: {rmdir_err}")
            
    else:
         logger.info("Skipping cleanup of intermediate/output files (LOCAL_DEV mode or cleanup disabled).")
    
    logger.info("Workflow finished.")

def main():
    """Main entry point for the workflow runner."""
    parser = argparse.ArgumentParser(description='Run RAG processing workflow')
    # Core arguments
    parser.add_argument('--config', default='workflow.yaml', help='Path to workflow configuration file (default: workflow.yaml)')
    parser.add_argument('--env-file', help='Path to .env file for environment variables')
    
    # Input overrides (mirroring config structure)
    parser.add_argument('--input-type', choices=['gcs', 'local_file', 'local_dir'], help='Override input type (gcs, local_file, local_dir)')
    parser.add_argument('--bucket-name', help='Override GCS bucket name')
    parser.add_argument('--object-name', help='Override GCS object name/path')
    parser.add_argument('--file-path', help='Override local file path for input')
    parser.add_argument('--directory-path', help='Override local directory path for input')
    
    # Default parameter overrides
    parser.add_argument('--workspace-id', help='REQUIRED: Workspace ID for document processing')
    parser.add_argument('--chunking-method', help='Override chunking method')
    parser.add_argument('--chunk-size', type=int, help='Override chunk size')
    parser.add_argument('--chunk-overlap', type=int, help='Override chunk overlap')
    parser.add_argument('--embedding-model', help='Override embedding model name')
    parser.add_argument('--connection-string', help='Override database connection string (takes precedence over env vars)')
    
    args = parser.parse_args()
    
    try:
        # Load environment variables first
        load_env_vars(args.env_file)
        
        # Load workflow configuration
        config_path = os.path.join(os.path.dirname(__file__), args.config) # Assume config is in same dir
        config = load_workflow_config(config_path)
        
        # Convert args to dictionary for overriding context
        cli_args = {k: v for k, v in vars(args).items() if k not in ['config', 'env_file']}
        
        # Ensure workspace_id is provided either via CLI or defaults in config
        if not cli_args.get('workspace_id') and not config.get('defaults', {}).get('workspace_id'):
             parser.error("Argument --workspace-id is required.")
        
        # Run the workflow
        run_workflow(config, cli_args)
        
        return 0
    
    except Exception as e:
        logger.error(f"Workflow execution failed: {str(e)}", exc_info=True)
        return 1

if __name__ == "__main__":
    # Ensure the processing directory itself is discoverable if running as main script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    parent_dir = os.path.dirname(current_dir)
    if parent_dir not in sys.path:
         sys.path.insert(0, parent_dir)
         
    sys.exit(main()) 