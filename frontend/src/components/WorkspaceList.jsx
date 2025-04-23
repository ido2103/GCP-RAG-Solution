// frontend/src/components/WorkspaceList.jsx
import React, { useState, useEffect } from 'react';
import { getWorkspaces } from '../services/workspaceService';
import '../App.css';

// Accept props from parent components, with ability to either receive workspaces or fetch them
function WorkspaceList({ workspaces: propWorkspaces, selectedWorkspaceId, onSelectWorkspace, refreshTrigger }) {
  const [localWorkspaces, setLocalWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use workspaces from props if available, otherwise use locally fetched ones
  const effectiveWorkspaces = propWorkspaces || localWorkspaces;

  // Fetch workspaces if not provided via props
  useEffect(() => {
    // Only fetch if workspaces aren't provided via props
    if (!propWorkspaces) {
      const fetchWorkspaces = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const data = await getWorkspaces();
          setLocalWorkspaces(data);
        } catch (err) {
          console.error("Failed to fetch workspaces in WorkspaceList:", err);
          setError(err.message || "Failed to load workspaces");
        } finally {
          setIsLoading(false);
        }
      };

      fetchWorkspaces();
    }
  }, [propWorkspaces, refreshTrigger]); // Depend on propWorkspaces and refreshTrigger

  // Loading state
  if (isLoading) {
    return <div>טוען רשימה...</div>;
  }

  // Error state
  if (error) {
    return <div className="error-text">שגיאה: {error}</div>;
  }

  // Empty state
  if (!effectiveWorkspaces || effectiveWorkspaces.length === 0) {
    return (
      <div className="workspace-list-container">
        <p>לא נמצאו סביבות עבודה. יש ליצור סביבת עבודה חדשה.</p>
      </div>
    );
  }

  // Normal state with workspaces
  return (
    <div className="workspace-list-container">
      <ul className="workspace-list">
        {effectiveWorkspaces.map((ws) => {
          const isSelected = ws.workspace_id === selectedWorkspaceId;
          
          return (
            <li
              key={ws.workspace_id}
              className={`workspace-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectWorkspace(ws.workspace_id)}
            >
              <strong className="workspace-name">{ws.name}</strong>
              <div className="workspace-details">
                <small>ID: {ws.workspace_id}</small>
                <small>Owner: {ws.owner_user_id}</small>
                <small>Created: {new Date(ws.created_at).toLocaleDateString()}</small>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default WorkspaceList;