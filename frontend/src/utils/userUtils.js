/**
 * Utility functions for working with user data
 */

/**
 * Creates a user-specific document ID by combining a base ID with the user ID
 * @param {string} baseId - The base identifier for the document
 * @param {string} userId - The user's Firebase UID
 * @returns {string} A combined ID in the format "baseId_userId"
 */
export const createUserSpecificId = (baseId, userId) => {
  if (!baseId || !userId) {
    throw new Error('Both baseId and userId are required to create a user-specific ID');
  }
  return `${baseId}_${userId}`;
};

/**
 * Extracts the base ID from a user-specific document ID
 * @param {string} userSpecificId - The combined ID in the format "baseId_userId"
 * @returns {string} The original base ID
 */
export const extractBaseId = (userSpecificId) => {
  if (!userSpecificId || !userSpecificId.includes('_')) {
    throw new Error('Invalid user-specific ID format');
  }
  return userSpecificId.split('_')[0];
};

/**
 * Creates a path for user-specific data in Firebase
 * @param {string} collectionName - The collection name
 * @param {string} userId - The user's Firebase UID
 * @param {string} [documentId] - Optional document ID
 * @returns {string} A path string for the user-specific data
 */
export const getUserDataPath = (collectionName, userId, documentId = null) => {
  if (!collectionName || !userId) {
    throw new Error('Collection name and userId are required');
  }
  
  const basePath = `users/${userId}/${collectionName}`;
  return documentId ? `${basePath}/${documentId}` : basePath;
};

/**
 * Creates a Firebase query filter for user-specific data
 * @param {string} userId - The user's Firebase UID
 * @returns {Object} A filter object that can be used in Firebase queries
 */
export const getUserFilter = (userId) => {
  if (!userId) {
    throw new Error('userId is required for creating a user filter');
  }
  return {
    userId: userId
  };
};

/**
 * Prepares data to be saved to Firebase by adding the user ID
 * @param {Object} data - The data object to save
 * @param {string} userId - The user's Firebase UID
 * @returns {Object} The data object with userId added
 */
export const prepareUserData = (data, userId) => {
  if (!data || !userId) {
    throw new Error('Both data and userId are required');
  }
  
  return {
    ...data,
    userId: userId,
    // Optional: Add timestamps or other metadata
    updatedAt: new Date().toISOString(),
  };
}; 