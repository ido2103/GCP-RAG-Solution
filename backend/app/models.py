from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional, Dict, Any, List
import uuid
from datetime import datetime

# --- Workspace Models ---

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of the workspace.")
    # Set default chunking method to recursive
    config_chunking_method: str = Field("recursive", description="Chunking method (e.g., 'recursive', 'token')")
    config_chunk_size: int = Field(1000, gt=0, description="Target size for text chunks.")
    config_chunk_overlap: int = Field(100, ge=0, description="Overlap size between chunks.")
    # Default similarity metric (embedding model related)
    config_similarity_metric: str = Field("text-multilingual-embedding-002", description="Embedding model name or similarity type")
    # group_id: Optional[uuid.UUID] = Field(None, description="Optional: Group ID to associate with this workspace.")


class WorkspaceResponse(BaseModel):
    workspace_id: uuid.UUID
    name: str
    owner_user_id: str
    created_at: datetime
    config_chunking_method: str
    config_chunk_size: int
    config_chunk_overlap: int
    config_similarity_metric: str
    # Add groups field if you implement workspace-group association
    # groups: Optional[List[GroupResponse]] = []

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