// frontend/src/services/workspaceService.js
import api from './apiService';

/**
 * Fetches a list of workspaces from the backend.
 * @returns {Promise<Array>} A promise that resolves to an array of workspace objects.
 */
const getWorkspaces = async () => {
  try {
    // Make GET request to the backend endpoint using the authenticated API
    const response = await api.get('/workspaces');
    // Response data is directly returned
    return response.data;
  } catch (error) {
    // Log the error and re-throw or handle it as needed
    console.error("Error fetching workspaces:", error.response?.data || error.message);
    // You might want to throw a more specific error or return an empty array/null
    throw error;
  }
};

/**
 * Creates a new workspace.
 * @param {object} workspaceData - Data for the new workspace (e.g., { name: 'New Workspace' }).
 * @returns {Promise<object>} A promise that resolves to the newly created workspace object.
 */
const createWorkspace = async (workspaceData) => {
  try {
    // Make POST request to the backend endpoint using the authenticated API
    const response = await api.post('/workspaces', workspaceData);
    return response.data; // Return the created workspace object from the response
  } catch (error) {
    console.error("Error creating workspace:", error.response?.data || error.message);
    // Re-throw the error so the component can handle it
    throw error;
  }
};

/**
 * Gets the file count for a specific workspace.
 * @param {string} workspaceId - The UUID of the workspace.
 * @returns {Promise<number>} A promise that resolves to the number of files in the workspace.
 */
const getWorkspaceFileCount = async (workspaceId) => {
  try {
    // Call the backend endpoint
    const response = await api.get(`/workspaces/${workspaceId}/files/count`);
    return response.data.count;
  } catch (error) {
    console.error(`Error fetching file count for workspace ${workspaceId}:`, error.response?.data || error.message);
    // Return 0 on error to avoid breaking the UI
    return 0;
  }
};

/**
 * Gets the list of files for a specific workspace.
 * @param {string} workspaceId - The UUID of the workspace.
 * @returns {Promise<Array>} A promise that resolves to the list of files in the workspace.
 */
const getWorkspaceFiles = async (workspaceId) => {
  try {
    // Call the backend endpoint
    const response = await api.get(`/workspaces/${workspaceId}/files`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching files for workspace ${workspaceId}:`, error.response?.data || error.message);
    // Return empty array on error to avoid breaking the UI
    return [];
  }
};

/**
 * Deletes a specific file (document) from a workspace.
 * Requires admin privileges on the backend.
 * @param {string} workspaceId - The UUID of the workspace.
 * @param {string} docId - The UUID of the document to delete.
 * @returns {Promise<void>} A promise that resolves on successful deletion.
 */
const deleteWorkspaceFile = async (workspaceId, docId) => {
  if (!workspaceId || !docId) {
    throw new Error("Workspace ID and Document ID are required for deletion.");
  }
  try {
    // Call the backend DELETE endpoint
    await api.delete(`/workspaces/${workspaceId}/files/${docId}`);
    // No data is returned on successful DELETE (204 No Content)
  } catch (error) {
    console.error(`Error deleting file ${docId} from workspace ${workspaceId}:`, error.response?.data || error.message);
    const detail = error.response?.data?.detail || error.message || "Failed to delete file.";
    throw new Error(detail);
  }
};

export { getWorkspaces, createWorkspace, getWorkspaceFileCount, getWorkspaceFiles, deleteWorkspaceFile };

