import React, { useState, useEffect, useRef } from 'react';
import CreateWorkspaceForm from './CreateWorkspaceForm';
import WorkspaceSelector from './WorkspaceSelector';
import { uploadFilesDirectly, ALLOWED_FILE_EXTENSIONS } from '../services/uploadService';
import { getWorkspaces, getWorkspaceFiles, deleteWorkspaceFile } from '../services/workspaceService';
import { updateWorkspaceConfig, deleteWorkspaceAdmin } from '../services/adminService';
import { useAuth } from '../contexts/AuthContext';
import '../App.css';

function WorkspaceManagementPage() {
  // Get user role from auth context
  const { userRole } = useAuth(); 
  const isAdmin = userRole === 'admin';

  // State for workspace management
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState('');
  
  // State for file list
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [fileDeleteStatus, setFileDeleteStatus] = useState({ message: '', isError: false, deletingDocId: null });

  // State for file upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState([]);
  const fileInputRef = useRef(null);

  // State for workspace configuration (placeholders for now)
  const [configChunkingMethod, setConfigChunkingMethod] = useState('recursive');
  const [configChunkSize, setConfigChunkSize] = useState(1000);
  const [configChunkOverlap, setConfigChunkOverlap] = useState(100);
  const [configSimilarityMetric, setConfigSimilarityMetric] = useState('cosine');
  const [configTopK, setConfigTopK] = useState(4);
  const [configHybridSearch, setConfigHybridSearch] = useState(false);
  const [configEmbeddingModel, setConfigEmbeddingModel] = useState('text-multilingual-embedding-002');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState({ message: '', isError: false });
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  // Add state for delete confirmation and status
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState({ message: '', isError: false });

  // State for tracking unsaved changes
  const [initialConfig, setInitialConfig] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
            // Populate config form when workspaces refresh and one is selected
            populateConfigForm(selectedWs);
          }
        }
      } catch (err) {
        console.error("Failed to fetch workspaces in management page:", err);
      }
    };

    fetchWorkspaces();
  }, [refreshKey, selectedWorkspaceId]); // Run when refreshKey changes or when selected ID changes

  // Fetch files when a workspace is selected
  useEffect(() => {
    const fetchFiles = async () => {
      if (!selectedWorkspaceId) {
        setWorkspaceFiles([]);
        return;
      }
      
      setIsLoadingFiles(true);
      setFileError(null);
      try {
        const files = await getWorkspaceFiles(selectedWorkspaceId);
        setWorkspaceFiles(files);
      } catch (err) {
        console.error("Failed to fetch workspace files:", err);
        setFileError(err.response?.data?.detail || err.message || 'שגיאה בטעינת קבצים.');
      } finally {
        setIsLoadingFiles(false);
      }
    };

    fetchFiles();
  }, [selectedWorkspaceId]); // Run only when selectedWorkspaceId changes

  // useEffect to update initialConfig and reset unsaved changes flag when workspace changes
  useEffect(() => {
    if (selectedWorkspaceId) {
      const selectedWs = workspaces.find(ws => ws.workspace_id === selectedWorkspaceId);
      if (selectedWs) {
        const currentConfig = {
          config_chunking_method: selectedWs.config_chunking_method || 'recursive',
          config_chunk_size: selectedWs.config_chunk_size || 1000,
          config_chunk_overlap: selectedWs.config_chunk_overlap || 100,
          config_similarity_metric: selectedWs.config_similarity_metric || 'cosine',
          config_top_k: selectedWs.config_top_k || 4,
          config_hybrid_search: selectedWs.config_hybrid_search || false,
          config_embedding_model: selectedWs.config_embedding_model || 'text-multilingual-embedding-002'
        };
        setInitialConfig(currentConfig);
        // Populate form state (this will trigger onChange comparisons indirectly, but we reset hasUnsavedChanges below)
        populateConfigForm(selectedWs);
        setHasUnsavedChanges(false); // Reset flag when selecting a workspace
        setIsLoadingConfig(false);
      } else {
        setInitialConfig(null);
        setHasUnsavedChanges(false);
        setIsLoadingConfig(false);
      }
    } else {
      setInitialConfig(null);
      setHasUnsavedChanges(false);
      setIsLoadingConfig(false);
    }
  }, [selectedWorkspaceId, workspaces]); // Depend on workspaces too, in case config is fetched later

  // useEffect to detect unsaved changes
  useEffect(() => {
    if (!initialConfig) {
      setHasUnsavedChanges(false);
      return;
    }

    const currentFormConfig = {
      config_chunking_method: configChunkingMethod,
      config_chunk_size: parseInt(configChunkSize, 10) || 0,
      config_chunk_overlap: parseInt(configChunkOverlap, 10) || 0,
      config_similarity_metric: configSimilarityMetric,
      config_top_k: parseInt(configTopK, 10) || 0,
      config_hybrid_search: configHybridSearch,
      config_embedding_model: configEmbeddingModel
    };

    // Compare current form state with initial state
    const changed = JSON.stringify(currentFormConfig) !== JSON.stringify({
      config_chunking_method: initialConfig.config_chunking_method,
      config_chunk_size: initialConfig.config_chunk_size || 0,
      config_chunk_overlap: initialConfig.config_chunk_overlap || 0,
      config_similarity_metric: initialConfig.config_similarity_metric,
      config_top_k: initialConfig.config_top_k || 0,
      config_hybrid_search: initialConfig.config_hybrid_search,
      config_embedding_model: initialConfig.config_embedding_model
    });

    setHasUnsavedChanges(changed);

  }, [
    configChunkingMethod, configChunkSize, configChunkOverlap, 
    configSimilarityMetric, configTopK, configHybridSearch, 
    configEmbeddingModel, initialConfig
  ]);

  const handleWorkspaceCreated = (newWorkspaceId) => {
    // When a workspace is created, increment the key to trigger a refresh
    setRefreshKey(prevKey => prevKey + 1);
    // Automatically select the new workspace
    setSelectedWorkspaceId(newWorkspaceId);
    // Fetch workspaces again to get the new one
    // This will also trigger the name update in the useEffect
  };

  // Function to populate config form from workspace data
  const populateConfigForm = (workspaceData) => {
    setConfigChunkingMethod(workspaceData.config_chunking_method || 'recursive');
    setConfigChunkSize(workspaceData.config_chunk_size || 1000);
    setConfigChunkOverlap(workspaceData.config_chunk_overlap || 100);
    setConfigSimilarityMetric(workspaceData.config_similarity_metric || 'cosine');
    setConfigTopK(workspaceData.config_top_k || 4);
    setConfigHybridSearch(workspaceData.config_hybrid_search || false);
    setConfigEmbeddingModel(workspaceData.config_embedding_model || 'text-multilingual-embedding-002');
  };

  const handleWorkspaceSelect = (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    setUploadResults([]);
    setUploadProgress(0);
    setConfigStatus({ message: '', isError: false });
    setFileDeleteStatus({ message: '', isError: false, deletingDocId: null }); // Reset file delete status
    setIsLoadingConfig(true); // Start loading indicator for config
    setInitialConfig(null); // Clear initial config here
    setHasUnsavedChanges(false); // Reset flag

    if (workspaceId) {
      // The useEffect [selectedWorkspaceId, workspaces] will handle populating
      // and setting initialConfig once workspaces data is available.
      const selectedWs = workspaces.find(ws => ws.workspace_id === workspaceId);
      if (selectedWs) {
          setSelectedWorkspaceName(selectedWs.name);
      } else {
          setSelectedWorkspaceName('');
      }
    } else {
      setSelectedWorkspaceName('');
      setIsLoadingConfig(false); // No workspace selected, not loading
    }
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

  // Modified handleSaveConfig to update initialConfig and reset flag
  const handleSaveConfig = async () => {
    if (!selectedWorkspaceId) return;
    setIsSavingConfig(true);
    setConfigStatus({ message: 'שומר הגדרות...', isError: false });

    const configData = {
      config_chunking_method: configChunkingMethod,
      config_chunk_size: parseInt(configChunkSize, 10) || null,
      config_chunk_overlap: parseInt(configChunkOverlap, 10) || 0,
      config_similarity_metric: configSimilarityMetric,
      config_top_k: parseInt(configTopK, 10) || null,
      config_hybrid_search: configHybridSearch,
      config_embedding_model: configEmbeddingModel || null
    };

    const updatePayload = Object.fromEntries(
      Object.entries(configData).filter(([, value]) => value !== null)
    );

    try {
      const updatedWorkspace = await updateWorkspaceConfig(selectedWorkspaceId, updatePayload);
      setConfigStatus({ message: 'ההגדרות נשמרו בהצלחה!', isError: false });
      
      setWorkspaces(prevWorkspaces => 
        prevWorkspaces.map(ws => 
          ws.workspace_id === updatedWorkspace.workspace_id ? updatedWorkspace : ws
        )
      );
      
      // Update initialConfig to the saved state and reset the flag
      setInitialConfig({
        config_chunking_method: updatedWorkspace.config_chunking_method || 'recursive',
        config_chunk_size: updatedWorkspace.config_chunk_size || 1000,
        config_chunk_overlap: updatedWorkspace.config_chunk_overlap || 100,
        config_similarity_metric: updatedWorkspace.config_similarity_metric || 'cosine',
        config_top_k: updatedWorkspace.config_top_k || 4,
        config_hybrid_search: updatedWorkspace.config_hybrid_search || false,
        config_embedding_model: updatedWorkspace.config_embedding_model || 'text-multilingual-embedding-002'
      });
      setHasUnsavedChanges(false); // Reset flag after successful save

      setTimeout(() => setConfigStatus({ message: '', isError: false }), 3000);
    } catch (error) {
      console.error("Error saving config:", error);
      setConfigStatus({ message: `שגיאה בשמירת ההגדרות: ${error.message}`, isError: true });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Handler for initiating delete
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setDeleteStatus({ message: '', isError: false }); // Clear previous status
  };

  // Handler for confirming delete
  const handleConfirmDelete = async () => {
    if (!selectedWorkspaceId || !isAdmin) return;

    setIsDeleting(true);
    setShowDeleteConfirm(false);
    setDeleteStatus({ message: 'מוחק סביבת עבודה...', isError: false });

    try {
      await deleteWorkspaceAdmin(selectedWorkspaceId);
      setDeleteStatus({ message: 'סביבת העבודה נמחקה בהצלחה!', isError: false });
      
      // Reset selection and refresh list
      setSelectedWorkspaceId(null);
      setSelectedWorkspaceName('');
      
      // Trigger immediate refresh
      setRefreshKey(prev => prev + 1); // Trigger workspace list refresh
      
      // Fetch workspaces again directly to ensure UI is updated
      try {
        const data = await getWorkspaces();
        setWorkspaces(data);
      } catch (error) {
        console.error("Failed to refresh workspaces after deletion:", error);
      }
      
      setTimeout(() => setDeleteStatus({ message: '', isError: false }), 4000);

    } catch (error) {
      console.error("Error deleting workspace:", error);
      setDeleteStatus({ message: `שגיאה במחיקת סביבת עבודה: ${error.message}`, isError: true });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler for cancelling delete
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // Function to handle file deletion
  const handleFileDelete = async (docId, filename) => {
    if (!isAdmin) return; // Extra safety check

    // Basic confirmation
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הקובץ "${filename}"? פעולה זו תסיר את הקובץ ואת כל הנתונים המקושרים אליו.`)) {
      return;
    }

    setFileDeleteStatus({ message: `מוחק את ${filename}...`, isError: false, deletingDocId: docId });

    try {
      await deleteWorkspaceFile(selectedWorkspaceId, docId);
      setFileDeleteStatus({ message: `הקובץ ${filename} נמחק בהצלחה!`, isError: false, deletingDocId: null });
      
      // Remove file from local state
      setWorkspaceFiles(prevFiles => prevFiles.filter(file => file.doc_id !== docId));

      // Clear message after a few seconds
      setTimeout(() => setFileDeleteStatus({ message: '', isError: false, deletingDocId: null }), 3000);

    } catch (error) {
      console.error(`Error deleting file ${docId}:`, error);
      setFileDeleteStatus({ message: `שגיאה במחיקת הקובץ ${filename}: ${error.message}`, isError: true, deletingDocId: null });
    }
  };

  // Style definitions (assuming they exist or add basic ones)
  const formSectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px' };
  const inputGroupStyle = { marginBottom: '15px' };
  const labelStyle = { display: 'block', marginBottom: '5px', fontWeight: 'bold' };
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' };
  const selectStyle = { ...inputStyle }; // Use same style for selects
  const checkboxLabelStyle = { marginLeft: '10px' };
  const buttonStyle = { padding: '10px 15px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
  const statusStyle = { padding: '8px', borderRadius: '4px', marginTop: '10px', fontSize: '14px' };
  const successStyle = { ...statusStyle, backgroundColor: '#e6f7e6', color: '#2e7d32' };
  const errorStyle = { ...statusStyle, backgroundColor: '#fdecea', color: '#c62828' };
  const unsavedChangesHeaderStyle = {
    backgroundColor: 'var(--warning-bg-color, #fff3e0)', // Light orange/yellow background
    color: 'var(--warning-text-color, #e65100)',      // Dark orange/brown text
    padding: '10px 15px',
    marginBottom: '15px',
    borderRadius: '4px',
    border: '1px solid var(--warning-border-color, #ffcc80)', // Orange border
    textAlign: 'center',
    fontWeight: 'bold',
    position: 'sticky',
    top: '0',
    zIndex: '1000'
  };
  const fileListItemStyle = { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '8px 0', 
    borderBottom: '1px solid #eee' 
  };
  const fileInfoStyle = { flexGrow: 1, marginRight: '10px' };
  const deleteButtonStyle = {
    padding: '5px 10px',
    backgroundColor: 'var(--danger-color, #f44336)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  };
  const disabledDeleteButtonStyle = {
    ...deleteButtonStyle,
    backgroundColor: '#ccc',
    cursor: 'not-allowed'
  };

  return (
    <div className="workspace-management-page">
      <h1>ניהול סביבות עבודה</h1>

      {/* Create Workspace Form - Show only if Admin and no workspace selected */}
      {isAdmin && !selectedWorkspaceId && (
        <div className="form-section" style={formSectionStyle}>
          <CreateWorkspaceForm onWorkspaceCreated={handleWorkspaceCreated} />
        </div>
      )}

      {/* Workspace Selector */}
      <div className="selector-section" style={formSectionStyle}>
        <h2>{selectedWorkspaceId ? "מרחב עבודה נבחר" : "בחירת סביבת עבודה"}</h2>
        <WorkspaceSelector 
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={handleWorkspaceSelect}
          refreshKey={refreshKey}
        />
      </div>

      {/* Configuration Section - Show only if a workspace is selected */} 
      {selectedWorkspaceId && (
        <div className="config-section" style={formSectionStyle}>
          <h2>הגדרות עיבוד (RAG) עבור: <strong>{selectedWorkspaceName}</strong></h2>
          
          {/* Unsaved Changes Header */} 
          {hasUnsavedChanges && (
            <div style={unsavedChangesHeaderStyle}>
              ישנם שינויים שלא נשמרו בהגדרות.
            </div>
          )}

          {isLoadingConfig ? (
            <p>טוען הגדרות...</p>
          ) : (
            <>
              {/* Config Inputs... (ensure onChange handlers are correctly updating state) */}
               {/* Example: Chunking Method Input */}
               <div style={inputGroupStyle}>
                 <label style={labelStyle} htmlFor="chunkingMethod">שיטת חלוקה (Chunking)</label>
                 <select 
                   id="chunkingMethod"
                   style={selectStyle}
                   value={configChunkingMethod}
                   onChange={(e) => setConfigChunkingMethod(e.target.value)} // This implicitly triggers the useEffect for hasUnsavedChanges
                   disabled={isSavingConfig}
                 >
                    <option value="recursive">Recursive Character</option>
                    <option value="character">Character (by separator)</option>
                    <option value="token">Token (OpenAI default)</option>
                    <option value="markdown">Markdown Header</option>
                    <option value="html">HTML Header</option>
                    <option value="sentence_transformers">Sentence Transformer Token</option>
                 </select>
               </div>
                {/* Chunk Size Input */}
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ ...inputGroupStyle, flex: 1 }}>
                    <label style={labelStyle} htmlFor="chunkSize">גודל Chunk</label>
                    <input 
                      id="chunkSize"
                      type="number"
                      style={inputStyle}
                      value={configChunkSize}
                      onChange={(e) => setConfigChunkSize(e.target.value)} 
                      disabled={isSavingConfig}
                    />
                  </div>
                  {/* Chunk Overlap Input */}
                  <div style={{ ...inputGroupStyle, flex: 1 }}>
                    <label style={labelStyle} htmlFor="chunkOverlap">חפיפה (Overlap)</label>
                    <input 
                      id="chunkOverlap"
                      type="number"
                      style={inputStyle}
                      value={configChunkOverlap}
                      onChange={(e) => setConfigChunkOverlap(e.target.value)} 
                      disabled={isSavingConfig}
                    />
                  </div>
                </div>
                 {/* Similarity Metric Input */}
                <div style={inputGroupStyle}>
                  <label style={labelStyle} htmlFor="similarityMetric">מדד דמיון (Similarity)</label>
                  <select 
                    id="similarityMetric"
                    style={selectStyle}
                    value={configSimilarityMetric}
                    onChange={(e) => setConfigSimilarityMetric(e.target.value)} 
                    disabled={isSavingConfig}
                  >
                    <option value="cosine">Cosine Distance</option>
                    <option value="l2">Euclidean Distance (L2)</option>
                    <option value="inner">Inner Product</option>
                  </select>
                </div>
                 {/* Top K Input */}
                <div style={inputGroupStyle}>
                  <label style={labelStyle} htmlFor="topK">מספר תוצאות (Top K)</label>
                  <input 
                    id="topK"
                    type="number"
                    style={inputStyle}
                    value={configTopK}
                    onChange={(e) => setConfigTopK(e.target.value)} 
                    disabled={isSavingConfig}
                  />
                </div>
                 {/* Hybrid Search Input */}
                <div style={inputGroupStyle}>
                  <input 
                    type="checkbox"
                    id="hybridSearch"
                    checked={configHybridSearch}
                    onChange={(e) => setConfigHybridSearch(e.target.checked)} 
                    disabled={isSavingConfig}
                  />
                  <label style={checkboxLabelStyle} htmlFor="hybridSearch">אפשר חיפוש היברידי (Hybrid Search)</label>
                </div>
                 {/* Embedding Model Input */}
                <div style={inputGroupStyle}>
                  <label style={labelStyle} htmlFor="embeddingModel">מודל הטמעה (Embedding)</label>
                  <input 
                    id="embeddingModel"
                    type="text"
                    style={inputStyle}
                    value={configEmbeddingModel}
                    onChange={(e) => setConfigEmbeddingModel(e.target.value)} 
                    disabled={isSavingConfig}
                  />
                </div>

              {/* Save Button & Status */} 
              <button 
                style={buttonStyle} 
                onClick={handleSaveConfig} 
                disabled={isSavingConfig || isLoadingConfig}
              >
                {isSavingConfig ? 'שומר...' : 'שמור הגדרות עיבוד'}
              </button>
              {configStatus.message && (
                <div style={configStatus.isError ? errorStyle : successStyle}>
                  {configStatus.message}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* File List Section - Show only if a workspace is selected */} 
      {selectedWorkspaceId && (
        <div className="workspace-files" style={formSectionStyle}>
          <h3>קבצים בסביבת העבודה: <strong>{selectedWorkspaceName}</strong></h3>
          {/* File delete status message */} 
          {fileDeleteStatus.message && fileDeleteStatus.deletingDocId === null && (
            <div style={fileDeleteStatus.isError ? errorStyle : successStyle}>
              {fileDeleteStatus.message}
            </div>
          )}
          {isLoadingFiles ? (
            <p>טוען קבצים...</p>
          ) : fileError ? (
            <p className="error-text">שגיאה בטעינת קבצים: {fileError}</p>
          ) : workspaceFiles.length === 0 ? (
            <p>אין קבצים בסביבת עבודה זו.</p>
          ) : (
            <ul className="file-list" style={{ listStyle: 'none', padding: 0 }}>
              {workspaceFiles.map(file => (
                <li key={file.doc_id} style={fileListItemStyle}>
                  <div style={fileInfoStyle}>
                    <span className="file-name">{file.filename}</span>
                    <span className="file-date" style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                      {new Date(file.uploaded_at).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Delete Button (Admin Only) */} 
                  {isAdmin && (
                    <button 
                      style={fileDeleteStatus.deletingDocId === file.doc_id ? disabledDeleteButtonStyle : deleteButtonStyle}
                      onClick={() => handleFileDelete(file.doc_id, file.filename)}
                      disabled={fileDeleteStatus.deletingDocId === file.doc_id}
                    >
                      {fileDeleteStatus.deletingDocId === file.doc_id ? 'מוחק...' : 'מחק'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* File Upload Section - Show only if a workspace is selected */} 
      {selectedWorkspaceId && (
        <div className="upload-section" style={formSectionStyle}>
          <h2>העלאת קבצים לסביבת עבודה: <strong>{selectedWorkspaceName}</strong></h2>
          
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
                    className={`result-item ${result.status === 'success' || result.status === 'success_local' || result.status === 'success_processing' || result.status === 'success_gcs' ? 'success' : 'error'}`}
                  >
                    <span className="filename">{result.filename || 'קובץ'}: </span>
                    <span className="message">{result.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Delete Workspace Button and Confirmation (Admin Only) */}
      {selectedWorkspaceId && isAdmin && (
        <div className="delete-section" style={{ marginTop: '20px', padding: '15px', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--danger-color)' }}>מחיקת סביבת עבודה</h3>
          <p>פעולה זו תמחק לצמיתות את סביבת העבודה, המסמכים והנתונים המשויכים.</p>
          
          {!showDeleteConfirm ? (
            <button 
              style={{ backgroundColor: 'var(--danger-color)', color: 'white', padding: '8px 15px', borderRadius: '4px', border: 'none', cursor: 'pointer' }} 
              onClick={handleDeleteClick}
              disabled={isDeleting}
            >
              {isDeleting ? 'מוחק...' : 'מחק סביבת עבודה'}
            </button>
          ) : (
            <div className="confirm-delete">
              <p><strong>האם אתה בטוח שברצונך למחוק את "{selectedWorkspaceName}"?</strong></p>
              <button 
                style={{ marginRight: '10px', backgroundColor: 'var(--danger-color)', color: 'white' }} 
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                כן, מחק
              </button>
              <button 
                style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-color)' }} 
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                ביטול
              </button>
            </div>
          )}
          {deleteStatus.message && (
             <div style={deleteStatus.isError ? errorStyle : successStyle}>
               {deleteStatus.message}
             </div>
           )}
        </div>
      )}
    </div>
  );
}

export default WorkspaceManagementPage;
