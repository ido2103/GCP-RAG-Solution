// frontend/src/services/uploadService.js
import axios from 'axios';

const API_URL = '/api'; // Using proxy

// Define allowed file extensions
const ALLOWED_FILE_EXTENSIONS = [
  '.txt', '.pdf', '.doc', '.docx', '.html', '.htm', 
  '.csv', '.xls', '.xlsx', '.ppt', '.pptx', '.md',
  '.json', '.xml'
];

/**
 * Uploads multiple files directly to the backend endpoint which then forwards to GCS.
 * @param {File[]} files - Array of File objects to upload.
 * @param {string} workspaceId - The UUID of the target workspace.
 * @param {function} onUploadProgress - Optional callback for upload progress updates.
 * @returns {Promise<object[]>} A promise that resolves to an array of responses for each file.
 */
const uploadFilesDirectly = async (files, workspaceId, onUploadProgress) => {
  // Validate file types client-side before sending
  const invalidFiles = [];
  
  for (const file of files) {
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      invalidFiles.push({
        filename: file.name,
        status: 'error',
        message: `File type ${fileExtension} not allowed. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`
      });
    }
  }
  
  // If there are invalid files, return early with error information
  if (invalidFiles.length > 0) {
    return Promise.reject({
      message: 'Some files have invalid types',
      results: invalidFiles
    });
  }
  
  // Create a FormData object to send the files and workspaceId
  const formData = new FormData();
  
  // Append all files to the formData
  for (const file of files) {
    formData.append('files', file); // 'files' must match the parameter name in FastAPI
  }
  
  formData.append('workspace_id_str', workspaceId); // Send workspace_id as form data

  try {
    const response = await axios.post(`${API_URL}/uploads/direct`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data', // Important for file uploads
      },
      onUploadProgress: progressEvent => {
        // Calculate percentage
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (onUploadProgress) {
          onUploadProgress(percentCompleted); // Call the progress callback
        }
        console.log(`Upload Progress: ${percentCompleted}%`);
      }
    });
    return response.data; // Returns array of results for each file
  } catch (error) {
    console.error("Error uploading files:", error.response?.data || error.message);
    throw error; // Re-throw for the component to handle
  }
};

/**
 * Legacy function for single file uploads, now using the multiple file upload internally
 * @param {File} file - Single File object to upload.
 * @param {string} workspaceId - The UUID of the target workspace.
 * @param {function} onUploadProgress - Optional callback for upload progress updates.
 * @returns {Promise<object>} A promise that resolves to the response for the file.
 */
const uploadFileDirectly = async (file, workspaceId, onUploadProgress) => {
  const results = await uploadFilesDirectly([file], workspaceId, onUploadProgress);
  return results[0]; // Return just the first result
};

export { uploadFileDirectly, uploadFilesDirectly, ALLOWED_FILE_EXTENSIONS };