import React, { useState, useEffect } from 'react';
import { 
  listWorkspaces, 
  listGroups, 
  createWorkspace, 
  deleteWorkspace, 
  getWorkspaceGroups,
  assignGroupsToWorkspace
} from '../../services/adminService';

const WorkspaceManagement = () => {
  const [workspaces, setWorkspaces] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for new workspace form
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
  const [selectedGroupIdForCreate, setSelectedGroupIdForCreate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // State for delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // --- State for Permissions Editing ---
  const [editingPermissionsWorkspaceId, setEditingPermissionsWorkspaceId] = useState(null);
  const [selectedPermissionGroupIds, setSelectedPermissionGroupIds] = useState([]);
  const [isFetchingPermissions, setIsFetchingPermissions] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState({ message: '', isError: false });
  // ------------------------------------
  
  // Status message states
  const [createStatus, setCreateStatus] = useState({ message: '', isError: false });
  const [deleteStatus, setDeleteStatus] = useState({ message: '', isError: false });
  
  // Fetch workspaces and groups on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [workspacesData, groupsData] = await Promise.all([
          listWorkspaces(),
          listGroups()
        ]);
        setWorkspaces(workspacesData);
        setGroups(groupsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle workspace creation
  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    
    if (!newWorkspaceName.trim()) {
      setCreateStatus({ message: 'יש להזין שם מרחב עבודה', isError: true });
      return;
    }
    
    if (!selectedGroupIdForCreate) {
      setCreateStatus({ message: 'יש לבחור קבוצה', isError: true });
      return;
    }
    
    setIsCreating(true);
    setCreateStatus({ message: 'יוצר מרחב עבודה...', isError: false });
    
    try {
      const workspaceData = {
        workspace_name: newWorkspaceName.trim(),
        description: newWorkspaceDescription.trim() || null,
        group_id: selectedGroupIdForCreate
      };
      
      const createdWorkspace = await createWorkspace(workspaceData);
      
      // Add new workspace to state
      setWorkspaces([...workspaces, createdWorkspace]);
      
      // Reset form
      setNewWorkspaceName('');
      setNewWorkspaceDescription('');
      setSelectedGroupIdForCreate('');
      
      setCreateStatus({ message: 'מרחב העבודה נוצר בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setCreateStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error creating workspace:', err);
      setCreateStatus({ message: 'שגיאה ביצירת מרחב העבודה', isError: true });
    } finally {
      setIsCreating(false);
    }
  };
  
  // Handle delete confirmation
  const confirmDelete = (workspaceId) => {
    setDeleteConfirmId(workspaceId);
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Handle workspace deletion
  const handleDeleteWorkspace = async (workspaceId) => {
    setDeleteStatus({ message: 'מוחק מרחב עבודה...', isError: false });
    try {
      await deleteWorkspace(workspaceId);
      
      setWorkspaces(workspaces.filter(workspace => workspace.workspace_id !== workspaceId));
      setDeleteStatus({ message: 'מרחב העבודה נמחק בהצלחה', isError: false });
      setDeleteConfirmId(null);
      
      setTimeout(() => {
        setDeleteStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error deleting workspace:', err);
      setDeleteStatus({ message: 'שגיאה במחיקת מרחב העבודה', isError: true });
    }
  };
  
  // Get group name by id
  const getGroupName = (groupId) => {
    const group = groups.find(g => g.group_id === groupId);
    return group ? group.group_name : 'קבוצה לא ידועה';
  };

  // --- Permissions Editing Functions ---
  const startEditPermissions = async (workspaceId) => {
    setEditingPermissionsWorkspaceId(workspaceId);
    setSelectedPermissionGroupIds([]);
    setPermissionStatus({ message: '', isError: false });
    setIsFetchingPermissions(true);
    try {
      const assignedGroupIds = await getWorkspaceGroups(workspaceId);
      setSelectedPermissionGroupIds(assignedGroupIds);
    } catch (err) {
      console.error(`Error fetching permissions for workspace ${workspaceId}:`, err);
      setPermissionStatus({ message: 'שגיאה בטעינת הרשאות קיימות', isError: true });
    } finally {
      setIsFetchingPermissions(false);
    }
  };

  const cancelEditPermissions = () => {
    setEditingPermissionsWorkspaceId(null);
    setSelectedPermissionGroupIds([]);
    setPermissionStatus({ message: '', isError: false });
  };

  const handlePermissionGroupToggle = (groupId) => {
    setSelectedPermissionGroupIds(prevIds => {
      if (prevIds.includes(groupId)) {
        return prevIds.filter(id => id !== groupId);
      } else {
        return [...prevIds, groupId];
      }
    });
  };

  const savePermissions = async (workspaceId) => {
    setIsSavingPermissions(true);
    setPermissionStatus({ message: 'שומר הרשאות...', isError: false });
    try {
      await assignGroupsToWorkspace(workspaceId, selectedPermissionGroupIds);
      setPermissionStatus({ message: 'ההרשאות נשמרו בהצלחה', isError: false });
      setEditingPermissionsWorkspaceId(null);
      
      setTimeout(() => {
        setPermissionStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error(`Error saving permissions for workspace ${workspaceId}:`, err);
      setPermissionStatus({ message: 'שגיאה בשמירת ההרשאות', isError: true });
    } finally {
      setIsSavingPermissions(false);
    }
  };
  // ------------------------------------
  
  // Style for card
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    padding: '15px',
    marginBottom: '15px',
  };
  
  // Style for form
  const formStyle = {
    ...cardStyle,
    backgroundColor: '#f5f5f5',
  };
  
  // Style for button
  const buttonStyle = {
    padding: '8px 12px',
    margin: '0 5px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };
  
  // Style for delete button
  const deleteButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#d93025',
  };
  
  // Style for cancel button
  const cancelButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#757575',
  };
  
  // Style for input
  const inputStyle = {
    width: '100%',
    padding: '8px',
    marginBottom: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  };
  
  // Style for status message
  const statusStyle = {
    padding: '8px',
    borderRadius: '4px',
    marginTop: '8px',
    fontSize: '14px',
  };
  
  // Style for success message
  const successStyle = {
    ...statusStyle,
    backgroundColor: '#e6f7e6',
    color: '#2e7d32',
  };
  
  // Style for error message
  const errorStyle = {
    ...statusStyle,
    backgroundColor: '#fdecea',
    color: '#c62828',
  };
  
  // Style for permission editor section
  const permissionEditorStyle = {
    borderTop: '1px solid #eee',
    marginTop: '15px',
    paddingTop: '15px',
  };
  
  // Style for checkbox label
  const checkboxLabelStyle = {
    display: 'block',
    marginBottom: '8px',
    cursor: 'pointer',
  };
  
  const checkboxStyle = {
     marginRight: '8px',
  };
  // --------------- 
  
  if (loading && workspaces.length === 0) return <div>טוען נתונים...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  
  return (
    <div className="workspace-management">
      <h1>ניהול מרחבי עבודה</h1>
      
      {/* Create workspace form */}
      <div style={formStyle}>
        <h3>יצירת מרחב עבודה חדש</h3>
        <form onSubmit={handleCreateWorkspace}>
          <div>
            <label htmlFor="workspace-name">שם מרחב העבודה *</label>
            <input
              id="workspace-name"
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="הזן שם מרחב עבודה"
              style={inputStyle}
              required
            />
          </div>
          
          <div>
            <label htmlFor="workspace-description">תיאור (אופציונלי)</label>
            <input
              id="workspace-description"
              type="text"
              value={newWorkspaceDescription}
              onChange={(e) => setNewWorkspaceDescription(e.target.value)}
              placeholder="הזן תיאור מרחב עבודה"
              style={inputStyle}
            />
          </div>
          
          <div>
            <label htmlFor="group-select">קבוצה *</label>
            <select
              id="group-select"
              value={selectedGroupIdForCreate}
              onChange={(e) => setSelectedGroupIdForCreate(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">בחר קבוצה</option>
              {groups.map(group => (
                <option key={group.group_id} value={group.group_id}>
                  {group.group_name}
                </option>
              ))}
            </select>
          </div>
          
          <button
            type="submit"
            style={buttonStyle}
            disabled={isCreating || !newWorkspaceName.trim() || !selectedGroupIdForCreate}
          >
            {isCreating ? 'יוצר מרחב עבודה...' : 'צור מרחב עבודה'}
          </button>
          
          {/* Create status message */}
          {createStatus.message && (
            <div style={createStatus.isError ? errorStyle : successStyle}>
              {createStatus.message}
            </div>
          )}
        </form>
      </div>
      
      <h3>מרחבי עבודה קיימים ({workspaces.length})</h3>
      
      {/* Delete status message (global) */}
      {deleteStatus.message && (
        <div style={deleteStatus.isError ? errorStyle : successStyle}>
          {deleteStatus.message}
        </div>
      )}
      
      {/* Workspace list */}
      {workspaces.map(workspace => (
        <div key={workspace.workspace_id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* Left side: Workspace details */}
            <div style={{ flexGrow: 1, marginRight: '20px' }}>
              <h3>{workspace.workspace_name}</h3>
              {workspace.description && (
                <p>{workspace.description}</p>
              )}
              <p>
                {/* Display Owner Info - Placeholder */} 
                {/* TODO: Need owner email/name? Requires joining or separate fetch */}
                {/* Owner User ID: {workspace.owner_user_id} */} 
              </p>
              <p style={{ fontSize: '12px', color: '#666' }}>
                מזהה: {workspace.workspace_id}
              </p>
              
              {/* Permission Editor Section - Conditionally Rendered */} 
              {editingPermissionsWorkspaceId === workspace.workspace_id && (
                <div style={permissionEditorStyle}>
                  <h4>ערוך הרשאות גישה לקבוצות</h4>
                  {isFetchingPermissions ? (
                    <p>טוען הרשאות...</p>
                  ) : permissionStatus.message && permissionStatus.isError ? (
                    <div style={errorStyle}>{permissionStatus.message}</div>
                  ) : (
                    <>
                      {groups.length === 0 ? (
                        <p>אין קבוצות מוגדרות במערכת.</p>
                      ) : (
                        groups.map(group => (
                          <label key={group.group_id} style={checkboxLabelStyle}>
                            <input 
                              type="checkbox"
                              style={checkboxStyle}
                              checked={selectedPermissionGroupIds.includes(group.group_id)}
                              onChange={() => handlePermissionGroupToggle(group.group_id)}
                              disabled={isSavingPermissions}
                            />
                            {group.group_name}
                            {group.description && ` (${group.description})`}
                          </label>
                        ))
                      )}
                      
                      {/* Save/Cancel Buttons for Permissions */} 
                      <div style={{ marginTop: '10px' }}>
                        <button
                          style={buttonStyle}
                          onClick={() => savePermissions(workspace.workspace_id)}
                          disabled={isSavingPermissions || isFetchingPermissions || groups.length === 0}
                        >
                          {isSavingPermissions ? 'שומר...' : 'שמור הרשאות'}
                        </button>
                        <button
                          style={cancelButtonStyle}
                          onClick={cancelEditPermissions}
                          disabled={isSavingPermissions}
                        >
                          ביטול
                        </button>
                      </div>
                      
                      {/* Permission Save Status */} 
                      {permissionStatus.message && !permissionStatus.isError && (
                          <div style={successStyle}>{permissionStatus.message}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Right side: Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
              {/* Edit Permissions Button */} 
              {editingPermissionsWorkspaceId !== workspace.workspace_id && (
                  <button 
                    style={buttonStyle}
                    onClick={() => startEditPermissions(workspace.workspace_id)}
                  >
                    ערוך הרשאות
                  </button>
              )}

              {/* Delete Button/Confirmation */} 
              {deleteConfirmId === workspace.workspace_id ? (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', color: '#d93025', marginBottom: '5px' }}>בטוח למחוק?</p>
                  <button
                    style={deleteButtonStyle}
                    onClick={() => handleDeleteWorkspace(workspace.workspace_id)}
                  >
                    כן, מחק
                  </button>
                  <button
                    style={cancelButtonStyle}
                    onClick={cancelDelete}
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  style={deleteButtonStyle}
                  onClick={() => confirmDelete(workspace.workspace_id)}
                  disabled={editingPermissionsWorkspaceId === workspace.workspace_id}
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {workspaces.length === 0 && !loading && (
        <p>אין מרחבי עבודה להצגה.</p>
      )}
    </div>
  );
};

export default WorkspaceManagement; 