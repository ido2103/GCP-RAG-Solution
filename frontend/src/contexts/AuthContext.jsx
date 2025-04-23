// frontend/src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signOut as firebaseSignOut, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Import Firebase auth service

// Create the context
const AuthContext = createContext();

// Custom hook to use the auth context
export function useAuth() {
  return useContext(AuthContext);
}

// Provider component
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState(null); // Explicitly store user ID
  const [loading, setLoading] = useState(true); // Track initial auth state loading
  const [idToken, setIdToken] = useState(null); // State to store the ID token
  const [authError, setAuthError] = useState(null); // State to track auth errors

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Set the user ID
        setUserId(user.uid);
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          console.log("Auth state changed: User logged in", user.uid);
          // TODO: Store token securely if needed for backend API calls
        } catch (error) {
          console.error("Error getting ID token:", error);
          setIdToken(null);
        }
      } else {
        console.log("Auth state changed: No user logged in.");
        setUserId(null);
        setIdToken(null);
      }
      setLoading(false); // Auth state determined, stop loading
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  // Function to sign in with email and password
  const signInWithEmail = async (email, password) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state listener will handle setting user and token
    } catch (error) {
      console.error("Error signing in with email/password:", error);
      setAuthError({
        code: error.code,
        message: error.message
      });
      throw error;
    }
  };

  // Function to create a new user with email and password
  const createUserWithEmail = async (email, password, displayName) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      // Update profile with display name if provided
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }
      // Auth state listener will handle setting user and token
    } catch (error) {
      console.error("Error creating user with email/password:", error);
      setAuthError({
        code: error.code,
        message: error.message
      });
      throw error;
    }
  };

  // Function to sign out
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // Auth state listener will handle setting user and token to null
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Value passed to consuming components
  const value = {
    currentUser,
    userId, // Explicitly provide the user ID
    idToken, // Provide the ID token
    loading,
    authError,
    signInWithEmail,
    createUserWithEmail,
    signOut,
  };

  // Render children only when not loading the initial auth state
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 