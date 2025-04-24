import React, { useState, useEffect } from 'react';
import WorkspaceSelector from './WorkspaceSelector';
import '../App.css';
import { getWorkspaces } from '../services/workspaceService';
import { useAuth } from '../contexts/AuthContext'; // Import Auth context

function ChatPage() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState('');
  
  // Chat/Query state
  const [queryText, setQueryText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get authentication state directly from context
  const { idToken, currentUser } = useAuth(); // Get idToken and currentUser

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

    // Clear messages when workspace changes
    setMessages([]);
    setError(null);
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

  // Handle query submission
  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    
    if (!queryText.trim() || !selectedWorkspaceId) {
      setError('יש להזין שאלה ולבחור סביבת עבודה');
      return;
    }

    const currentQueryText = queryText; // Store current query before clearing
    setQueryText(''); // Clear input immediately

    // Add user message to the chat
    const newUserMessage = {
      id: Date.now().toString(),
      text: currentQueryText, // Use stored query text
      isUser: true,
      timestamp: new Date().toISOString()
    };
    
    // Create history BEFORE adding the new user message
    const historyForPrompt = messages
      .filter(msg => !msg.isError) // Exclude error messages
      .slice(-50) // Get last 50 messages (25 user, 25 AI turns approx)
      .map(msg => ({ 
        role: msg.isUser ? 'user' : 'model',
        parts: [{ text: msg.text }] 
      }));

    // Add user message and a placeholder for AI response
    const aiPlaceholderMessage = {
      id: Date.now().toString() + '-response',
      text: '', // Start with empty text
      isUser: false,
      timestamp: new Date().toISOString(),
      isLoading: true // Add a flag for loading state
    };

    setMessages(prev => [...prev, newUserMessage, aiPlaceholderMessage]);
    setIsQueryLoading(true);
    setError(null);

    try {
      if (!idToken) {
        throw new Error('אימות משתמש לא זמין (Token not found)');
      }

      // Send query and history to backend
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          query: currentQueryText,
          chat_history: historyForPrompt,
          temperature: 0.3 // Keep temperature setting for now
        }),
      });

      if (!response.ok) {
        // Handle non-streaming errors (e.g., 4xx, 5xx before stream starts)
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `שגיאת שרת: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Response body is null, cannot stream.");
      }

      // Handle the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamingDone = false;
      let currentAiText = '';

      while (!streamingDone) {
        const { value, done } = await reader.read();
        streamingDone = done;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          currentAiText += chunk;
          
          // Update the placeholder message with the new chunk
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === aiPlaceholderMessage.id 
                ? { ...msg, text: currentAiText, isLoading: false } // Update text, mark as not loading
                : msg
            )
          );
        }
      }
      // Final update to ensure loading state is false if stream ends abruptly
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg.id === aiPlaceholderMessage.id 
            ? { ...msg, isLoading: false } 
            : msg
        )
      );

    } catch (err) {
      console.error("Query failed:", err);
      const errorText = `השאילתה נכשלה: ${err.message}`;
      setError(errorText);
      
      // Update the placeholder to show the error, or add a new error message
      setMessages(prevMessages => {
          const existingPlaceholderIndex = prevMessages.findIndex(msg => msg.id === aiPlaceholderMessage.id);
          
          if (existingPlaceholderIndex !== -1) {
              // Update placeholder with error
              const updatedMessages = [...prevMessages];
              updatedMessages[existingPlaceholderIndex] = {
                   ...updatedMessages[existingPlaceholderIndex],
                   text: errorText,
                   isError: true,
                   isLoading: false
               };
              return updatedMessages;
          } else {
              // Add a new error message if placeholder somehow missing
              console.warn("AI placeholder message not found for error update.");
              const errorMessage = {
                  id: Date.now().toString() + '-error',
                  text: errorText,
                  isUser: false,
                  isError: true,
                  timestamp: new Date().toISOString()
              };
              return [...prevMessages, errorMessage];
          }
      });

    } finally {
      setIsQueryLoading(false); // Overall query process finished
    }
  };

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

      {/* Chat Interface */}
      <div className="chat-container">
        <h2>ממשק שאילתות</h2>
        
        {!selectedWorkspaceId ? (
          <p className="warning-text">יש לבחור סביבת עבודה כדי להתחיל בשיחה.</p>
        ) : (
          <>
            <p>מחובר לסביבת עבודה: <strong>{selectedWorkspaceName || 'טוען...'}</strong></p>
            
            {/* Messages Display */}
            <div className="chat-messages">
              {messages.length === 0 ? (
                <p className="placeholder-text">
                  שאל שאלה על המסמכים בסביבת העבודה הזו.
                </p>
              ) : (
                messages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`message ${msg.isUser ? 'user-message' : 'ai-message'} ${msg.isError ? 'error-message' : ''}`}
                  >
                    <div className="message-content">{msg.text}</div>
                    {msg.processingTime && (
                      <div className="message-meta">זמן עיבוד: {msg.processingTime}ms</div>
                    )}
                  </div>
                ))
              )}
              {isQueryLoading && (
                <div className="message ai-message loading">
                  <div className="loading-indicator">מעבד שאילתה...</div>
                </div>
              )}
            </div>
            
            {/* Error display */}
            {error && !isQueryLoading && <div className="error-text">{error}</div>}
            
            {/* Chat Input */}
            <form onSubmit={handleQuerySubmit} className="chat-input-container">
              <input 
                type="text" 
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="הקלד את שאלתך כאן..."
                disabled={isQueryLoading}
                className="chat-input"
              />
              <button 
                type="submit"
                disabled={isQueryLoading || !queryText.trim()}
                className="send-button"
              >
                {isQueryLoading ? 'מעבד...' : 'שלח'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
