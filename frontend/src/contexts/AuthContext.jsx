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
import { jwtDecode } from 'jwt-decode'; // <-- Import jwt-decode

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
  const [userRole, setUserRole] = useState(null); // <-- Add state for user role
  const [userGroups, setUserGroups] = useState([]); // <-- Add state for user groups

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Set the user ID
        setUserId(user.uid);
        try {
          const token = await user.getIdToken(true); // Force refresh token
          setIdToken(token);
          console.log("Auth state changed: User logged in", user.uid);

          // <-- Decode token and set claims -->
          try {
            const decodedToken = jwtDecode(token);
            const role = decodedToken.role || null; // Extract role claim
            const groups = decodedToken.groups || []; // Extract groups claim
            setUserRole(role);
            setUserGroups(groups);
            console.log(`User role: ${role}, groups: ${groups.join(', ')}`);
          } catch (decodeError) {
            console.error("Error decoding ID token:", decodeError);
            setUserRole(null);
            setUserGroups([]);
          }
          // <-- End decoding -->

        } catch (error) {
          console.error("Error getting/decoding ID token:", error);
          setIdToken(null);
          setUserRole(null);
          setUserGroups([]);
        }
      } else {
        console.log("Auth state changed: No user logged in.");
        setUserId(null);
        setIdToken(null);
        setUserRole(null); // <-- Reset role on logout
        setUserGroups([]); // <-- Reset groups on logout
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
      // Auth state listener will handle setting user, token, and claims
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
      // Auth state listener will handle setting user, token, and initial (likely null) claims
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
      // Auth state listener will handle setting user, token, role, and groups to null/empty
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
    userRole, // <-- Add userRole to context value
    userGroups, // <-- Add userGroups to context value
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