from pydantic import BaseModel, Field, EmailStr, validator, root_validator
from typing import Optional, Dict, Any, List
import uuid
from datetime import datetime

# --- Workspace Models ---

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of the workspace.")
    config_chunking_method: str = Field("recursive", description="Chunking method (e.g., 'recursive', 'token')")
    config_chunk_size: int = Field(1000, gt=0, description="Target size for text chunks.")
    config_chunk_overlap: int = Field(100, ge=0, description="Overlap size between chunks.")
    config_similarity_metric: str = Field("cosine", description="Vector search type (cosine, l2, inner)")
    config_top_k: int = Field(4, gt=0, description="Default number of results to retrieve (Top K)")
    config_hybrid_search: bool = Field(False, description="Enable hybrid search by default?")
    config_embedding_model: str = Field("text-multilingual-embedding-002", description="Default embedding model name")
    # group_id: Optional[uuid.UUID] = Field(None, description="Optional: Group ID to associate with this workspace.")

class WorkspaceConfigUpdate(BaseModel):
    # Use Optional for updates, as not all fields might be sent
    config_chunking_method: Optional[str] = Field(None, description="Chunking method (e.g., 'recursive', 'semantic')")
    config_chunk_size: Optional[int] = Field(None, gt=0, description="Target size for text chunks.")
    config_chunk_overlap: Optional[int] = Field(None, ge=0, description="Overlap size between chunks.")
    config_similarity_metric: Optional[str] = Field(None, description="Vector search type (cosine, l2, inner)")
    config_top_k: Optional[int] = Field(None, gt=0, description="Number of results to retrieve (Top K)")
    config_hybrid_search: Optional[bool] = Field(None, description="Enable hybrid search?")
    config_embedding_model: Optional[str] = Field(None, description="Embedding model name")

    # Replace field validator with a root validator
    @root_validator(pre=True)
    def check_at_least_one_value(cls, values):
        # Check if any field has a non-None value
        if not any(value is not None for value in values.values()):
            raise ValueError("At least one configuration field must be provided for update")
        return values

class WorkspaceResponse(BaseModel):
    workspace_id: uuid.UUID
    name: str
    owner_user_id: str
    created_at: datetime
    # Ensure all config fields from the DB are here
    config_chunking_method: Optional[str] = None
    config_chunk_size: Optional[int] = None
    config_chunk_overlap: Optional[int] = None
    config_similarity_metric: Optional[str] = None
    config_top_k: Optional[int] = None
    config_hybrid_search: Optional[bool] = None
    config_embedding_model: Optional[str] = None

    class Config:
        from_attributes = True # Allows creating model from ORM objects (even dicts work well)

# --- Document Models (Example) ---
class DocumentMetadata(BaseModel):
    filename: str
    gcs_path: Optional[str] = None
    status: str
    uploaded_at: datetime
    doc_id: uuid.UUID
    
    class Config:
        from_attributes = True # <-- ADDED

# --- User Models (Example - for later use with Auth) ---
class User(BaseModel):
    user_id: str
    email: Optional[EmailStr] = None
    role: Optional[str] = None # e.g., 'admin', 'user'
    groups: List[str] = [] # List of group names user belongs to

# --- Group Models ---

class GroupBase(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=100, description="Unique name for the group")
    description: Optional[str] = Field(None, max_length=500, description="Optional description for the group")

class GroupCreate(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=100, description="Unique name for the group.")
    description: Optional[str] = Field(None, max_length=255, description="Optional description for the group.")

class GroupResponse(BaseModel):
    group_id: uuid.UUID
    group_name: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# --- Models for Admin Actions --- 

class UserGroupAssignment(BaseModel):
    group_names: List[str] = Field([], description="List of group *names* to assign to the user. Replaces existing groups.")

class WorkspaceGroupAssignment(BaseModel):
    group_ids: List[uuid.UUID] = Field([], description="List of group IDs to grant access to the workspace. Replaces existing assignments.")

class UserRoleAssignment(BaseModel):
    role: Optional[str] = Field(None, description="Role to assign (e.g., 'admin', 'user'). Null clears the role.")

# Model to represent a user listed by admin
class UserAdminView(BaseModel):
    user_id: str
    email: Optional[EmailStr] = None
    disabled: bool
    last_sign_in: Optional[datetime] = None
    created: Optional[datetime] = None
    role: Optional[str] = None
    groups: List[str] = []

class WorkspaceGroupAccessEntry(BaseModel):
    workspace_id: uuid.UUID
    group_id: uuid.UUID