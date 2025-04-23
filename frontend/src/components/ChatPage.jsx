import React, { useState, useEffect } from 'react';
import WorkspaceSelector from './WorkspaceSelector';
import '../App.css';
import { getWorkspaces } from '../services/workspaceService';

function ChatPage() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState('');

  // Fetch all workspaces to be able to lookup names
  useEffect(() => {
    const fetchWorkspaces = async () => {
      setIsLoading(true);
      try {
        const data = await getWorkspaces();
        setWorkspaces(data);
      } catch (err) {
        console.error("Failed to fetch workspaces in ChatPage:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  // Handle workspace selection
  const handleWorkspaceSelect = (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    
    // Find the workspace name from the ID
    if (workspaceId && workspaces.length > 0) {
      const selectedWorkspace = workspaces.find(ws => ws.workspace_id === workspaceId);
      setSelectedWorkspaceName(selectedWorkspace ? selectedWorkspace.name : '');
    } else {
      setSelectedWorkspaceName('');
    }
  };

  // Update workspace name if workspaces are loaded after selection
  useEffect(() => {
    if (selectedWorkspaceId && workspaces.length > 0 && !selectedWorkspaceName) {
      const selectedWorkspace = workspaces.find(ws => ws.workspace_id === selectedWorkspaceId);
      if (selectedWorkspace) {
        setSelectedWorkspaceName(selectedWorkspace.name);
      }
    }
  }, [selectedWorkspaceId, workspaces, selectedWorkspaceName]);

  return (
    <div className="chat-page">
      <h1>מערכת RAG</h1>

      {/* Workspace Selection */}
      <div className="workspace-selector-container">
        <WorkspaceSelector 
          selectedWorkspaceId={selectedWorkspaceId} 
          onSelectWorkspace={handleWorkspaceSelect} 
        />
      </div>

      {/* Chat Interface Placeholder */}
      <div className="chat-container">
        <h2>ממשק צ'אט</h2>
        
        {!selectedWorkspaceId ? (
          <p className="warning-text">יש לבחור סביבת עבודה כדי להתחיל בשיחה.</p>
        ) : (
          <>
            <p>מחובר לסביבת עבודה: <strong>{selectedWorkspaceName || 'טוען...'}</strong></p>
            <div className="chat-messages">
              <p className="placeholder-text">
                כאן יוצגו הודעות הצ'אט בעתיד.
              </p>
            </div>
            
            {/* Chat Input Placeholder */}
            <div className="chat-input-container">
              <input 
                type="text" 
                placeholder="הקלד את שאלתך כאן..."
                disabled
                className="chat-input"
              />
              <button 
                disabled
                className="send-button"
              >
                שלח
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
