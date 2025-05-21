import React, { useState, useEffect } from 'react';
import WorkspaceSelector from './WorkspaceSelector';
import '../App.css';
import { getWorkspaces } from '../services/workspaceService';
import { useAuth } from '../contexts/AuthContext'; // Import Auth context
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
import remarkGfm from 'remark-gfm'; // Import remark-gfm plugin
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css'; // Import the basic styles
import { JSONTree } from 'react-json-tree';

// JSON tree theme - dark mode friendly
const jsonTreeTheme = {
  scheme: 'monokai',
  base00: '#272822', // background
  base01: '#383830',
  base02: '#49483e',
  base03: '#75715e', // comments, invisibles, line highlighting
  base04: '#a59f85', // dark foreground (used for status bars)
  base05: '#f8f8f2', // default foreground, caret, delimiters, operators
  base06: '#f5f4f1',
  base07: '#f9f8f5', // light foreground
  base08: '#f92672', // variables, XML tags, markup link text, markup lists
  base09: '#fd971f', // integers, boolean, constants, XML attributes, markup link url
  base0A: '#f4bf75', // classes, markup bold, search text background
  base0B: '#a6e22e', // strings, inherited class, markup code, diff inserted
  base0C: '#a1efe4', // support, regular expressions, escape characters, markup quotes
  base0D: '#66d9ef', // functions, methods, attribute IDs, headings
  base0E: '#ae81ff', // keywords, storage, selector, markup italic, diff changed
  base0F: '#cc6633'  // deprecated, opening/closing embedded language tags
};

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
  
  // Metadata modal state
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [currentMetadata, setCurrentMetadata] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);

  // Get authentication state directly from context
  const { idToken, currentUser, userRole } = useAuth(); // Get idToken, currentUser, and userRole
  
  // Check if user is admin using userRole from context
  const isAdmin = userRole === 'admin';

  // Function to open metadata modal
  const openMetadataModal = (metadata) => {
    setCurrentMetadata(metadata);
    setIsMetadataModalOpen(true);
    setSelectedTab(0); // Reset to first tab when opening
  };

  // Function to close metadata modal
  const closeMetadataModal = () => {
    setIsMetadataModalOpen(false);
    setCurrentMetadata(null);
  };
  
  // Helper function to format time (ms to readable format)
  const formatTime = (timeMs) => {
    if (timeMs < 1000) return `${timeMs}ms`;
    return `${(timeMs / 1000).toFixed(2)}s`;
  };

  // Helper function to extract overview data from metadata
  const getOverviewData = (metadata) => {
    if (!metadata) return null;
    
    return {
      query: metadata.query || 'Unknown query',
      totalDuration: metadata.total_duration_ms ? formatTime(metadata.total_duration_ms) : 'Unknown',
      retrievalDuration: metadata.retrieval_duration_ms ? formatTime(metadata.retrieval_duration_ms) : 'Unknown',
      embeddingModel: metadata.embedding_model || 'Unknown',
      llmModel: metadata.llm_model || 'Unknown',
      temperature: metadata.temperature ?? 'Unknown',
      topK: metadata.top_k ?? 'Unknown',
    };
  };

  // Helper function to extract and format documents from metadata
  const getDocumentsData = (metadata) => {
    if (!metadata || !metadata.retrieved_chunks) return [];
    return metadata.retrieved_chunks;
  };

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

    // Use AbortController to handle cancellation of the request if needed
    const abortController = new AbortController();
    const { signal } = abortController;

    try {
      if (!idToken) {
        throw new Error('אימות משתמש לא זמין (Token not found)');
      }

      // Send query and history to backend as POST request
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
        signal: signal // Add abort signal to the fetch request
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `שגיאת שרת: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Response body is null, cannot stream.");
      }

      // Revised SSE parsing implementation
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // Buffer for incoming data
      let currentAiText = ''; // Accumulator for the final text
      let metadata = null; // Store metadata if received

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // console.log("Current buffer:", JSON.stringify(buffer));

        // Process complete message blocks from the buffer (separated by \n\n)
        let blockEndIndex;
        while ((blockEndIndex = buffer.indexOf('\n\n')) >= 0) {
          const messageBlock = buffer.substring(0, blockEndIndex);
          buffer = buffer.substring(blockEndIndex + 2); // Remove the processed block + \n\n
          // console.log("Processing block:", JSON.stringify(messageBlock));

          if (!messageBlock.trim()) continue; // Skip empty blocks resulting from multiple \n\n
          let blockEventType = 'message'; // Default type for this block
          let blockDataContent = ''; // Accumulate data lines *within this block*
          let isInsideDataField = false; // Flag to track if we are processing multi-line data
          const lines = messageBlock.split('\n');

          for (const line of lines) {
            if (line.startsWith('event:')) {
                blockEventType = line.substring(6).trim();
                isInsideDataField = false; // Reset flag on new event
            } else if (line.startsWith('data:')) {
                // Extract data content
                let data = line.substring(5);
                if (data.startsWith(' ')) {
                    data = data.substring(1);
                }
                // If we were already inside a data field (multi-line), prepend a newline
                if (isInsideDataField) {
                     blockDataContent += '\n';
                }
                blockDataContent += data;
                isInsideDataField = true; // We are now processing a data field
            } else if (isInsideDataField) {
                // If we are inside a data field, append this line as continuation
                blockDataContent += '\n' + line;
            } else if (line.startsWith(':')) {
                // Ignore comments
                 isInsideDataField = false; // Comments end data fields
            } else if (line.trim()) {
                 // Log detailed info about the unexpected line
                 const charCodes = Array.from(line).map(char => char.charCodeAt(0));
                 console.warn(`Ignoring unexpected line in SSE block. Line: "${line}", CharCodes: [${charCodes.join(', ')}]`);
                 isInsideDataField = false; // Unexpected lines likely end data fields
            }
          }

          // Reset flag after processing the block (belt and suspenders)
          isInsideDataField = false;

          // Process the fully accumulated data based on the event type for this block
          if (blockEventType === 'message') {
              // Append the accumulated data (potentially multi-line) from this block
              if (blockDataContent) {
                 console.log("Adding content from block:", JSON.stringify(blockDataContent));
                 currentAiText += blockDataContent;
              }
          } else if (blockEventType === 'debug') {
              // Try parsing metadata
              try {
                  const parsedMeta = JSON.parse(blockDataContent);
                  metadata = parsedMeta; // Store the latest metadata
                  console.log("Received debug metadata:", metadata);
              } catch (e) {
                  console.error("Failed to parse debug metadata:", e, "Raw:", blockDataContent);
              }
          }
          
          // Update UI progressively ONLY if text was added
          if (blockEventType === 'message' && blockDataContent) {
              setMessages(prevMessages =>
               prevMessages.map(msg =>
                 msg.id === aiPlaceholderMessage.id
                   ? { ...msg, text: currentAiText, isLoading: true }
                   : msg
               )
             );
          }
        } // end while loop for processing blocks in buffer
      } // end while loop for reading stream

      // Flush the decoder in case there are any remaining bytes
      buffer += decoder.decode(); 

      // Process any remaining data in the buffer after the stream ends
      if (buffer.trim()) { // Check if there's anything left in the buffer to process
          // Re-process the remaining buffer content using the line parser logic
          let remainingLines = buffer.split('\n');
          for (const line of remainingLines) {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith('data:')) {
                  let data = trimmedLine.substring(5);
                  if (data.startsWith(' ')) {
                      data = data.substring(1);
                  }
                  currentAiText += data;
              } // Add handling for event/comment lines if necessary in final buffer
          }
      }

      // Final UI update after the stream ends
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === aiPlaceholderMessage.id
            ? { 
                ...msg, 
                text: currentAiText, // Ensure final text is set
                isLoading: false, // Ensure loading is false
                metadata: metadata || msg.metadata // Apply final metadata
              }
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
                    <div className="message-content">
                      {msg.isUser ? (
                        msg.text // Render user text directly
                      ) : (
                        // Use ReactMarkdown for AI responses
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      )}
                    </div>
                    <div className="message-footer">
                      {msg.processingTime && (
                        <div className="message-meta">זמן עיבוד: {msg.processingTime}ms</div>
                      )}
                      {/* Display metadata button only for admin users and if metadata exists */}
                      {isAdmin && !msg.isUser && msg.metadata && (
                        <button 
                          className="metadata-button"
                          onClick={() => openMetadataModal(msg.metadata || {})}
                        >
                          צפה במטה-דאטה
                        </button>
                      )}
                    </div>
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
      
      {/* Enhanced Metadata Modal with Tabs */}
      {isMetadataModalOpen && currentMetadata && (
        <div className="metadata-modal-overlay" onClick={closeMetadataModal}>
          <div className="metadata-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="metadata-modal-header">מטה-דאטה שאילתה</h3>
            
            <Tabs className="metadata-tabs" selectedIndex={selectedTab} onSelect={index => setSelectedTab(index)}>
              <TabList className="metadata-tab-list">
                <Tab className="metadata-tab">סקירה כללית</Tab>
                <Tab className="metadata-tab">מסמכים שאוחזרו</Tab>
                <Tab className="metadata-tab">נתונים מלאים</Tab>
              </TabList>

              {/* Overview Tab */}
              <TabPanel className="metadata-tab-panel">
                <div className="metadata-overview">
                  {currentMetadata && (
                    <div className="overview-grid">
                      <div className="overview-item">
                        <div className="overview-label">שאילתה</div>
                        <div className="overview-value">{currentMetadata.query || 'לא זמין'}</div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">זמן עיבוד כולל</div>
                        <div className="overview-value highlight">
                          {currentMetadata.total_duration_ms ? formatTime(currentMetadata.total_duration_ms) : 'לא זמין'}
                        </div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">זמן אחזור</div>
                        <div className="overview-value">
                          {currentMetadata.retrieval_duration_ms ? formatTime(currentMetadata.retrieval_duration_ms) : 'לא זמין'}
                        </div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">מודל אמבדינג</div>
                        <div className="overview-value">{currentMetadata.embedding_model || 'לא זמין'}</div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">מודל שפה</div>
                        <div className="overview-value">{currentMetadata.llm_model || 'לא זמין'}</div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">טמפרטורה</div>
                        <div className="overview-value">{currentMetadata.temperature ?? 'לא זמין'}</div>
                      </div>
                      
                      <div className="overview-item">
                        <div className="overview-label">מספר קטעים</div>
                        <div className="overview-value">{currentMetadata.top_k ?? 'לא זמין'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </TabPanel>

              {/* Retrieved Chunks Tab */}
              <TabPanel className="metadata-tab-panel">
                <div className="metadata-chunks">
                  {currentMetadata && currentMetadata.retrieved_chunks ? (
                    currentMetadata.retrieved_chunks.length > 0 ? (
                      <div className="chunks-list">
                        {currentMetadata.retrieved_chunks.map((chunk, index) => (
                          <div className="chunk-item" key={index}>
                            <div className="chunk-header">
                              <div className="chunk-title">מסמך {index + 1}: {chunk.source}</div>
                              <div className="chunk-score">
                                ציון רלוונטיות: <span className="highlight">{(100 - chunk.similarity_score * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="chunk-metadata">
                              <span>עמוד: {chunk.page_number}</span>
                              <span>מקטע: {chunk.chunk_index}</span>
                            </div>
                            <div className="chunk-content">
                              <div className="content-label">תוכן:</div>
                              <div className="content-preview">{chunk.content_preview}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">לא נמצאו מסמכים רלוונטיים</div>
                    )
                  ) : (
                    <div className="empty-state">נתוני מסמכים אינם זמינים</div>
                  )}
                </div>
              </TabPanel>

              {/* Raw Data Tab */}
              <TabPanel className="metadata-tab-panel">
                <div className="metadata-json">
                  <JSONTree 
                    data={currentMetadata} 
                    theme={jsonTreeTheme}
                    invertTheme={false}
                    shouldExpandNode={() => false} // Start collapsed
                    hideRoot={false}
                  />
                </div>
              </TabPanel>
            </Tabs>
            
            <button className="close-modal-button" onClick={closeMetadataModal}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPage;
