import React, { useState, useEffect, useRef } from 'react';
import CreateWorkspaceForm from './CreateWorkspaceForm';
import WorkspaceList from './WorkspaceList';
import { uploadFilesDirectly, ALLOWED_FILE_EXTENSIONS } from '../services/uploadService';
import { getWorkspaces } from '../services/workspaceService';
import '../App.css';

function WorkspaceManagementPage() {
  // State for workspace management
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState('');
  
  // State for file upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState([]);
  const fileInputRef = useRef(null);

  // Convert allowed extensions to a comma-separated string for the accept attribute
  const acceptFileTypes = ALLOWED_FILE_EXTENSIONS.join(',');

  // Fetch workspaces when component mounts or refreshKey changes
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const data = await getWorkspaces();
        setWorkspaces(data);
        
        // Update selected workspace name if we have a selected ID
        if (selectedWorkspaceId && data.length > 0) {
          const selectedWs = data.find(ws => ws.workspace_id === selectedWorkspaceId);
          if (selectedWs) {
            setSelectedWorkspaceName(selectedWs.name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch workspaces in management page:", err);
      }
    };

    fetchWorkspaces();
  }, [refreshKey, selectedWorkspaceId]);

  const handleWorkspaceCreated = (newWorkspaceId) => {
    // When a workspace is created, increment the key to trigger a refresh
    setRefreshKey(prevKey => prevKey + 1);
    // Automatically select the new workspace
    setSelectedWorkspaceId(newWorkspaceId);
    
    // A newly created workspace needs a refresh to get its name
    // We'll get the name in the useEffect when workspaces are fetched again
  };

  const handleWorkspaceSelect = (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    
    // Find workspace name
    if (workspaceId && workspaces.length > 0) {
      const selectedWs = workspaces.find(ws => ws.workspace_id === workspaceId);
      setSelectedWorkspaceName(selectedWs ? selectedWs.name : '');
    } else {
      setSelectedWorkspaceName('');
    }
    
    // Reset upload states when changing workspace
    setUploadResults([]);
    setUploadProgress(0);
  };

  // Handle file upload
  const handleFileChange = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    
    if (!selectedWorkspaceId) {
      setUploadResults([{
        status: 'error',
        message: "לא ניתן להעלות: לא נבחרה סביבת עבודה."
      }]);
      return;
    }

    setIsUploading(true);
    setUploadResults([]);
    setUploadProgress(0);

    try {
      // Convert FileList to array
      const filesArray = Array.from(files);
      
      // Upload all files
      const results = await uploadFilesDirectly(
        filesArray,
        selectedWorkspaceId,
        (progress) => setUploadProgress(progress)
      );
      
      setUploadResults(results);
      console.log("Upload results:", results);
    } catch (err) {
      let errorResults = [];
      
      if (err.results && Array.isArray(err.results)) {
        // This is from our client-side validation
        errorResults = err.results;
      } else if (err.response?.data) {
        // This is from the server
        errorResults = Array.isArray(err.response.data) 
          ? err.response.data 
          : [{ status: 'error', message: err.response.data.detail || "העלאת הקבצים נכשלה." }];
      } else {
        // Generic error
        errorResults = [{ status: 'error', message: err.message || "העלאת הקבצים נכשלה." }];
      }
      
      setUploadResults(errorResults);
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="workspace-management-page">
      <h1>ניהול סביבות עבודה</h1>

      {/* Create Workspace Form */}
      <div className="form-section">
        <CreateWorkspaceForm onWorkspaceCreated={handleWorkspaceCreated} />
      </div>

      {/* Workspace List with selection */}
      <div className="list-section">
        <h2>סביבות עבודה קיימות</h2>
        <WorkspaceList 
          refreshTrigger={refreshKey} 
          onSelectWorkspace={handleWorkspaceSelect} 
          selectedWorkspaceId={selectedWorkspaceId}
          workspaces={workspaces}
        />
      </div>

      {/* File Upload Section */}
      <div className="upload-section">
        <h2>העלאת קבצים לסביבת עבודה</h2>
        
        {!selectedWorkspaceId ? (
          <p className="warning-text">יש לבחור סביבת עבודה לפני העלאת קבצים.</p>
        ) : (
          <p>מעלה קבצים לסביבת עבודה: <strong>{selectedWorkspaceName || 'טוען...'}</strong></p>
        )}
        
        <div className="file-input-container">
          <p className="file-types-info">
            סוגי קבצים מורשים: {ALLOWED_FILE_EXTENSIONS.join(', ')}
          </p>
          <input
            type="file"
            onChange={handleFileChange}
            disabled={!selectedWorkspaceId || isUploading}
            ref={fileInputRef}
            className="file-input"
            multiple
            accept={acceptFileTypes}
          />
        </div>
        
        {isUploading && (
          <div className="upload-progress">
            <p>מעלה קבצים... {uploadProgress}%</p>
            {/* Progress bar */}
            <div className="progress-bar-container">
              <div 
                className="progress-bar"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {uploadResults.length > 0 && (
          <div className="upload-results">
            <h3>תוצאות העלאה:</h3>
            <ul className="results-list">
              {uploadResults.map((result, index) => (
                <li 
                  key={index} 
                  className={`result-item ${result.status === 'success' ? 'success' : 'error'}`}
                >
                  <span className="filename">{result.filename || 'קובץ'}: </span>
                  <span className="message">{result.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceManagementPage;
