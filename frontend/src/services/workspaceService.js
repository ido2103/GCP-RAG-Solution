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

export { getWorkspaces, createWorkspace };

