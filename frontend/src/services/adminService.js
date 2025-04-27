import api from './apiService';

/**
 * Fetches all users from Firebase (admin only).
 * @returns {Promise<Array>} A promise that resolves to an array of user objects.
 */
const listUsers = async () => {
  try {
    const response = await api.get('/admin/users');
    return response.data;
  } catch (error) {
    console.error("Error fetching users:", error.response?.data || error.message);
    throw error;
  }
};

// NOTE: User creation is not supported by the backend API.
// Users must register through Firebase Authentication or another identity provider.
// The POST /admin/users endpoint returns 405 Method Not Allowed
/* 
const createUser = async (userData) => {
  try {
    const response = await api.post('/admin/users', userData);
    return response.data;
  } catch (error) {
    console.error("Error creating user:", error.response?.data || error.message);
    throw error;
  }
};
*/

/**
 * Deletes a user.
 * @param {string} userId - The UUID of the user to delete.
 * @returns {Promise<void>} A promise that resolves when the user is deleted.
 */
const deleteUser = async (userId) => {
  try {
    await api.delete(`/admin/users/${userId}`);
  } catch (error) {
    console.error("Error deleting user:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Updates a user's role.
 * @param {string} userId - The Firebase UID of the user.
 * @param {string} role - The role to assign ('admin', 'user').
 * @returns {Promise<void>} A promise that resolves when the role is updated.
 */
const updateUserRole = async (userId, role) => {
  try {
    await api.put(`/admin/users/${userId}/role`, { role });
  } catch (error) {
    console.error("Error updating user role:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Assigns a user to a specific group.
 * @param {string} userId - The UUID of the user.
 * @param {string} groupIdToAdd - The UUID of the group to add.
 * @param {string[]} currentGroupNames - The user's current list of group names.
 * @returns {Promise<void>} A promise that resolves when the user is assigned to the group.
 */
const assignUserToGroup = async (userId, groupIdToAdd, currentGroupNames) => {
  try {
    console.log(`Assigning user ${userId} to group ID ${groupIdToAdd}. Current names:`, currentGroupNames);
    
    // Find the name of the group to add
    const groupsResponse = await listGroups();
    const targetGroup = groupsResponse.find(g => g.group_id === groupIdToAdd);
    
    if (!targetGroup) {
      throw new Error(`Group with ID ${groupIdToAdd} not found`);
    }
    const groupNameToAdd = targetGroup.group_name;
    console.log(`Group name to add: ${groupNameToAdd}`);

    // Add the new group name if not already in the list
    let updatedGroupNames = [...currentGroupNames]; // Clone the array
    if (!updatedGroupNames.includes(groupNameToAdd)) {
      updatedGroupNames.push(groupNameToAdd);
    }
    
    console.log('Updated group names to PUT:', updatedGroupNames);
    
    // Update the user's groups
    await api.put(`/admin/users/${userId}/groups`, { group_names: updatedGroupNames });
    console.log(`Successfully assigned user ${userId} to group ${groupNameToAdd}`);
  } catch (error) {
    console.error("Error assigning user to group:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Removes a user from a specific group.
 * @param {string} userId - The UUID of the user.
 * @param {string} groupIdToRemove - The UUID of the group to remove.
 * @param {string[]} currentGroupNames - The user's current list of group names.
 * @returns {Promise<void>} A promise that resolves when the user is removed from the group.
 */
const removeUserFromGroup = async (userId, groupIdToRemove, currentGroupNames) => {
  try {
    console.log(`Removing user ${userId} from group ID ${groupIdToRemove}. Current names:`, currentGroupNames);

    // Find the name of the group to remove
    const groupsResponse = await listGroups();
    const targetGroup = groupsResponse.find(g => g.group_id === groupIdToRemove);

    if (!targetGroup) {
      // If the group definition isn't found, maybe it was already deleted?
      // We can still proceed to remove the name if it exists in the user's list.
      console.warn(`Group definition with ID ${groupIdToRemove} not found, but attempting removal by ID.`);
      // Fallback: try removing based on ID if name lookup fails (less ideal)
      // This part is tricky as the backend expects names. Let's assume the group existed.
      // If this becomes an issue, we need to handle cases where group definitions are missing.
      throw new Error(`Cannot determine name for Group ID ${groupIdToRemove}. Group definition may be missing.`);
    }
    const groupNameToRemove = targetGroup.group_name;
    console.log(`Group name to remove: ${groupNameToRemove}`);

    // Remove the target group name
    const updatedGroupNames = currentGroupNames.filter(name => name !== groupNameToRemove);
    console.log('Updated group names to PUT:', updatedGroupNames);
    
    // Update the user's groups
    await api.put(`/admin/users/${userId}/groups`, { group_names: updatedGroupNames });
    console.log(`Successfully removed user ${userId} from group ${groupNameToRemove}`);
  } catch (error) {
    console.error("Error removing user from group:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetches all groups.
 * @returns {Promise<Array>} A promise that resolves to an array of group objects.
 */
const listGroups = async () => {
  try {
    const response = await api.get('/admin/groups');
    return response.data;
  } catch (error) {
    console.error("Error fetching groups:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Creates a new user group.
 * @param {Object} groupData - The group data (e.g., { group_name: 'Engineering', description: 'Engineering team' })
 * @returns {Promise<Object>} A promise that resolves to the created group object.
 */
const createGroup = async (groupData) => {
  try {
    const response = await api.post('/admin/groups', groupData);
    return response.data;
  } catch (error) {
    console.error("Error creating group:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Deletes a user group.
 * @param {string} groupId - The UUID of the group to delete.
 * @returns {Promise<void>} A promise that resolves when the group is deleted.
 */
const deleteGroup = async (groupId) => {
  try {
    await api.delete(`/admin/groups/${groupId}`);
  } catch (error) {
    console.error("Error deleting group:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Assigns groups to a user.
 * @param {string} userId - The Firebase UID of the user.
 * @param {string[]} groupNames - Array of group names to assign to the user.
 * @returns {Promise<void>} A promise that resolves when the groups are assigned.
 */
const assignGroupsToUser = async (userId, groupNames) => {
  try {
    await api.put(`/admin/users/${userId}/groups`, { group_names: groupNames });
  } catch (error) {
    console.error("Error assigning groups to user:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Sets a user's role.
 * @param {string} userId - The Firebase UID of the user.
 * @param {string|null} role - The role to assign ('admin', 'user', or null to clear).
 * @returns {Promise<void>} A promise that resolves when the role is set.
 */
const setUserRole = async (userId, role) => {
  try {
    await api.put(`/admin/users/${userId}/role`, { role });
  } catch (error) {
    console.error("Error setting user role:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetches all workspaces.
 * @returns {Promise<Array>} A promise that resolves to an array of workspace objects.
 */
const listWorkspaces = async () => {
  try {
    const response = await api.get('/workspaces');
    return response.data;
  } catch (error) {
    console.error("Error fetching workspaces:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Creates a new workspace.
 * @param {Object} workspaceData - The workspace data (e.g., { workspace_name: 'Project X', description: 'Project X workspace', group_id: 'uuid' })
 * @returns {Promise<Object>} A promise that resolves to the created workspace object.
 */
const createWorkspace = async (workspaceData) => {
  try {
    const response = await api.post('/admin/workspaces', workspaceData);
    return response.data;
  } catch (error) {
    console.error("Error creating workspace:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Deletes a workspace.
 * @param {string} workspaceId - The UUID of the workspace to delete.
 * @returns {Promise<void>} A promise that resolves when the workspace is deleted.
 */
const deleteWorkspace = async (workspaceId) => {
  try {
    await api.delete(`/admin/workspaces/${workspaceId}`);
  } catch (error) {
    console.error("Error deleting workspace:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Deletes a workspace.
 * @param {string} workspaceId - The UUID of the workspace to delete.
 * @returns {Promise<void>} A promise that resolves when the workspace is deleted.
 */
const deleteWorkspaceAdmin = async (workspaceId) => {
  try {
    // Fix the endpoint URL - remove the duplicate /api/ prefix
    await api.delete(`/workspaces/${workspaceId}`);
  } catch (error) {
    console.error("Error deleting workspace:", error.response?.data || error.message);
    // Propagate a user-friendly error message
    const detail = error.response?.data?.detail || error.message || "Failed to delete workspace.";
    throw new Error(detail);
  }
};

/**
 * Fetches all workspace-group assignments.
 * @returns {Promise<Array<{workspace_id: string, group_id: string}>>} A promise that resolves to an array of assignment objects.
 */
const getAllWorkspaceGroupAssignments = async () => {
  try {
    const response = await api.get(`/admin/workspace-group-assignments`);
    return response.data || []; // Ensure it returns an array
  } catch (error) {
    console.error(`Error fetching all workspace-group assignments:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetches the list of group IDs assigned to a specific workspace.
 * @param {string} workspaceId - The UUID of the workspace.
 * @returns {Promise<string[]>} A promise that resolves to an array of group UUID strings.
 */
const getWorkspaceGroups = async (workspaceId) => {
  try {
    const response = await api.get(`/admin/workspaces/${workspaceId}/groups`);
    // The backend returns { group_ids: [...] }, so we extract the array.
    return response.data.group_ids || []; 
  } catch (error) {
    console.error(`Error fetching groups for workspace ${workspaceId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Assigns groups to a workspace.
 * @param {string} workspaceId - The UUID of the workspace.
 * @param {string[]} groupIds - Array of group UUIDs to assign to the workspace.
 * @returns {Promise<void>} A promise that resolves when the groups are assigned.
 */
const assignGroupsToWorkspace = async (workspaceId, groupIds) => {
  try {
    await api.put(`/admin/workspaces/${workspaceId}/groups`, { group_ids: groupIds });
  } catch (error) {
    console.error("Error assigning groups to workspace:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Updates the configuration for a specific workspace.
 * Requires admin privileges.
 * @param {string} workspaceId - The UUID of the workspace to update.
 * @param {object} configData - An object containing the configuration fields to update.
 *                                Example: { config_chunk_size: 500, config_top_k: 5 }
 * @returns {Promise<object>} A promise that resolves to the updated workspace object.
 */
const updateWorkspaceConfig = async (workspaceId, configData) => {
  if (!workspaceId) {
    throw new Error("Workspace ID is required to update configuration.");
  }
  try {
    // Use the new endpoint
    const response = await api.put(`/workspaces/${workspaceId}/config`, configData);
    return response.data; // Return the updated workspace data
  } catch (error) {
    console.error(`Error updating config for workspace ${workspaceId}:`, error.response?.data || error.message);
    // Provide a more specific error message if possible
    const detail = error.response?.data?.detail || error.message || "Failed to update workspace configuration.";
    throw new Error(detail);
  }
};

export {
  listUsers,
  // createUser, - removed since not supported by the backend
  deleteUser,
  updateUserRole,
  listGroups,
  createGroup,
  deleteGroup,
  assignUserToGroup,
  removeUserFromGroup,
  assignGroupsToUser,
  setUserRole,
  listWorkspaces,
  createWorkspace,
  deleteWorkspace,
  deleteWorkspaceAdmin,
  getAllWorkspaceGroupAssignments,
  getWorkspaceGroups,
  assignGroupsToWorkspace,
  updateWorkspaceConfig
}; 