from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import uuid
from datetime import datetime

# --- Workspace Models ---

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Name of the workspace")
    # owner_user_id will be determined from the authenticated user token later
    # config fields can be added here if you want to set them on creation,
    # otherwise they use DB defaults
    config_chunking_method: Optional[str] = 'recursive'
    config_chunk_size: Optional[int] = 1000
    config_chunk_overlap: Optional[int] = 100
    config_similarity_metric: Optional[str] = 'cosine'


class WorkspaceResponse(BaseModel):
    workspace_id: uuid.UUID
    name: str
    owner_user_id: str
    created_at: datetime
    config_chunking_method: str
    config_chunk_size: int
    config_chunk_overlap: int
    config_similarity_metric: str

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
    user_id: str # From Identity Platform / Firebase Auth
    email: Optional[str] = None
    role: Optional[str] = None       # e.g., 'admin', 'user'
    groups: Optional[List[str]] = [] # List of group names the user belongs to
    # Add other fields as needed

# --- Group Models ---

class GroupBase(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=100, description="Unique name for the group")
    description: Optional[str] = Field(None, max_length=500, description="Optional description for the group")

class GroupCreate(GroupBase):
    # Inherits group_name and description
    pass

class GroupResponse(GroupBase):
    group_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

# --- Models for Admin Actions --- 

class UserGroupAssignment(BaseModel):
    group_names: List[str] = Field(..., description="List of group names to assign to the user.")

class WorkspaceGroupAssignment(BaseModel):
    group_ids: List[uuid.UUID] = Field(..., description="List of group UUIDs to grant access to the workspace.")

class UserRoleAssignment(BaseModel):
    role: Optional[str] = Field(None, description="The role to assign (e.g., 'admin', 'user', or None to clear)")

# Model to represent a user listed by admin
class UserAdminView(BaseModel):
    user_id: str
    email: Optional[str] = None
    disabled: bool
    last_sign_in: Optional[datetime] = None
    created: Optional[datetime] = None
    role: Optional[str] = None
    groups: Optional[List[str]] = []