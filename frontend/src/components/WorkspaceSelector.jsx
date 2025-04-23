import React, { useState, useEffect } from 'react';
import { getWorkspaces } from '../services/workspaceService';
import '../App.css';

function WorkspaceSelector({ selectedWorkspaceId, onSelectWorkspace }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getWorkspaces();
        setWorkspaces(data);
      } catch (err) {
        console.error("Failed to fetch workspaces:", err);
        setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת סביבות העבודה.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  if (isLoading) {
    return <p>טוען סביבות עבודה...</p>;
  }

  if (error) {
    return <p className="error-text">שגיאה: {error}</p>;
  }

  if (workspaces.length === 0) {
    return <p>לא נמצאו סביבות עבודה. <a href="/workspaces">צור סביבת עבודה חדשה</a></p>;
  }

  return (
    <div className="workspace-selector">
      <label htmlFor="workspaceSelect" className="selector-label">
        בחר סביבת עבודה:
      </label>
      <select
        id="workspaceSelect"
        value={selectedWorkspaceId || ''}
        onChange={(e) => onSelectWorkspace(e.target.value)}
        className="workspace-select"
      >
        <option value="">-- בחר סביבת עבודה --</option>
        {workspaces.map(ws => (
          <option key={ws.workspace_id} value={ws.workspace_id}>
            {ws.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default WorkspaceSelector;
