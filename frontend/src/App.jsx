import React, { useState, useEffect, useRef } from 'react'; 
import './App.css'; 
import WorkspaceList from './components/WorkspaceList';
import CreateWorkspaceForm from './components/CreateWorkspaceForm';
import { getWorkspaces } from './services/workspaceService'; 
import { uploadFileDirectly } from './services/uploadService'; 

function App() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for upload status
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const fileInputRef = useRef(null); 

  // Fetch workspaces for the dropdown when the component mounts
  // Removed selectedWorkspaceId dependency to avoid re-fetching when selecting
  useEffect(() => {
    const fetchInitialWorkspaces = async () => {
      setIsLoading(true);
      console.log('Attempting to fetch workspaces...');
      try {
        console.log('Making API request to /api/workspaces');
        const data = await getWorkspaces();
        console.log('Received workspace data:', data);
        setWorkspaces(data);
        // Set default selection if possible
        if (data.length > 0 && !selectedWorkspaceId) {
          console.log('Setting default selection:', data[0].workspace_id);
          setSelectedWorkspaceId(data[0].workspace_id);
        } else if (data.length === 0) {
          console.log('No workspaces found');
          setSelectedWorkspaceId(null); // Use null for no selection
        }
      } catch (error) {
        console.error("Failed to fetch workspaces", error);
        console.error("Error details:", {
          message: error.message, 
          response: error.response?.data,
          status: error.response?.status,
          headers: error.response?.headers
        });
        setError(error.message || "Failed to load workspaces");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialWorkspaces();
  }, []); // Run only on mount

  // Function called when a workspace is created or selected
  const handleWorkspaceSelect = (workspaceId) => {
    console.log("Workspace selected/created:", workspaceId);
    setSelectedWorkspaceId(workspaceId);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);
    // Reset file input if a workspace is selected/changed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Function to refresh the workspace list (passed to CreateWorkspaceForm)
  const refreshWorkspaces = async () => {
    setIsLoading(true);
    try {
      const data = await getWorkspaces();
      setWorkspaces(data);
      // Keep current selection if it still exists, otherwise select first or none
      const currentSelectionExists = data.some(ws => ws.workspace_id === selectedWorkspaceId);
      if (!currentSelectionExists && data.length > 0) {
        setSelectedWorkspaceId(data[0].workspace_id);
      } else if (data.length === 0) {
        setSelectedWorkspaceId(null);
      }
    } catch (error) {
      console.error("Failed to refresh workspaces", error);
      setError(error.message || "Failed to refresh workspaces");
    } finally {
      setIsLoading(false);
    }
  };

  // Function called when a file is selected
  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return; 
    }
    if (!selectedWorkspaceId) {
      setUploadError("Cannot upload: No workspace selected.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0); 

    try {
      const result = await uploadFileDirectly(
        file,
        selectedWorkspaceId,
        (progress) => setUploadProgress(progress) 
      );
      setUploadSuccess(`File '${result.filename}' uploaded successfully to ${result.gcs_path}!`);
      console.log("Upload result:", result);
      // TODO: Optionally trigger a refresh of a file list component later
    } catch (err) {
      let errorMessage = "File upload failed."; 

      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail) && err.response.data.detail.length > 0) {
          errorMessage = err.response.data.detail[0].msg || errorMessage;
        } else if (typeof err.response.data.detail === 'string') {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setUploadError(errorMessage); 
      console.error("Upload failed (raw error object):", err); 
      // --- MODIFICATION END ---
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }; 

  return (
    <div className="app-container">

      {/* Main Content Area */}
      <main className="main-content">
        <h1>מערכת RAG</h1> 

        {/* Placeholder for Chat Interface or other main content */}
        <h2>אזור תוכן ראשי</h2>
        <p>כאן יוצג ממשק הצ'אט או תוכן אחר.</p>
        {selectedWorkspaceId ? (
           <p>סביבת עבודה נבחרת: {selectedWorkspaceId}</p>
        ) : (
          <p>לא נבחרה סביבת עבודה.</p>
        )}

        {/* Upload Section */}
        <div className="upload-section">
          <h3>העלאת קובץ לסביבת עבודה נוכחית</h3>
          <input
            type="file"
            onChange={handleFileChange}
            disabled={!selectedWorkspaceId || isUploading} 
            ref={fileInputRef} 
            style={{ display: 'block', marginBottom: '10px' }}
          />
          {!selectedWorkspaceId && (
            <p className="warning-text">יש לבחור או ליצור סביבת עבודה תחילה.</p>
          )}
          {isUploading && (
            <div className="upload-progress">
              <p>מעלה קובץ... {uploadProgress}%</p>
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          {uploadError && <p className="error-text">שגיאת העלאה: {uploadError}</p>}
          {uploadSuccess && <p className="success-text">{uploadSuccess}</p>}
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="sidebar">
        <h2>ניהול סביבות עבודה</h2>

        {/* Create Workspace Form */}
        <div style={{ marginBottom: '20px' }}>
          <CreateWorkspaceForm 
            onWorkspaceCreated={(createdWs) => { 
              if (createdWs && createdWs.workspace_id) {
                handleWorkspaceSelect(createdWs.workspace_id); // Pass only the ID
                refreshWorkspaces(); 
              } else {
                console.error("Workspace creation callback didn't receive expected data", createdWs);
                refreshWorkspaces(); // Still refresh even if callback data is weird
              }
            }} 
          />
        </div>

        {/* Workspace List */}
        <div>
          {isLoading && <p>טוען...</p>} 
          {error && <p className="error-text">שגיאה: {error}</p>}
          {!isLoading && !error && (
            <WorkspaceList
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={handleWorkspaceSelect}
            />
          )}
        </div>

      </aside>

    </div>
  );
}

export default App;