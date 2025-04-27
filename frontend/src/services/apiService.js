// frontend/src/services/apiService.js
import axios from 'axios';
import { auth } from '../firebaseConfig';

// Create an axios instance with a base URL
const api = axios.create({
  baseURL: '/api',
});

// Request interceptor to add authorization headers
api.interceptors.request.use(
  async (config) => {
    // Get the current user
    const user = auth.currentUser;
    console.log('[apiService] Interceptor triggered. Current user:', user ? user.uid : 'null');
    
    if (user) {
      try {
        console.log('[apiService] Attempting to get ID token (force refresh=true)...');
        // Get a fresh ID token (force refresh if needed)
        const token = await user.getIdToken(true);
        console.log('[apiService] Token obtained successfully (first 10 chars):', token ? token.substring(0, 10) : 'null');
        
        // Add the token to the Authorization header
        config.headers.Authorization = `Bearer ${token}`;
        
        // Optional: Add the user ID explicitly to request headers
        config.headers['X-User-ID'] = user.uid;
      } catch (error) {
        console.error('[apiService] Error getting auth token:', error);
        // Handle specific errors if needed, e.g., redirect to login
      }
    } else {
      console.warn('[apiService] No current user found. Request will be unauthenticated.');
      // Optionally clear any existing auth header if user becomes null
      delete config.headers.Authorization;
    }
    
    return config;
  },
  (error) => {
    // Log request errors
    console.error('[apiService] Request error:', error);
    return Promise.reject(error);
  }
);

// Optional: Add a response interceptor for handling 401 errors globally
api.interceptors.response.use(
  response => response, // Pass through successful responses
  error => {
    console.error('[apiService] Response error:', error.response?.status, error.response?.data);
    if (error.response && error.response.status === 401) {
      // Handle unauthorized errors, e.g., redirect to login page
      console.warn('[apiService] Received 401 Unauthorized. Potential token issue or lack of permissions.');
      // Example: window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export default api;
