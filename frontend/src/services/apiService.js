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
    
    if (user) {
      try {
        // Get a fresh ID token
        const token = await user.getIdToken(true);
        
        // Add the token to the Authorization header
        config.headers.Authorization = `Bearer ${token}`;
        
        // Optional: Add the user ID explicitly to request headers
        config.headers['X-User-ID'] = user.uid;
      } catch (error) {
        console.error('Error getting auth token:', error);
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
