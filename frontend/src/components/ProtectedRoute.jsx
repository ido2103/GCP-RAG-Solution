import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * A wrapper component that checks if the user has the required role before rendering children.
 * If not, redirects to the specified redirect path.
 * 
 * @param {Object} props
 * @param {string} props.requiredRole - The role required to access this route (e.g., 'admin')
 * @param {string} props.redirectPath - Where to redirect if access is denied
 * @param {React.ReactNode} props.children - The components to render if access is granted
 */
const ProtectedRoute = ({ requiredRole, redirectPath = '/', children }) => {
  const { userRole, loading } = useAuth();
  const location = useLocation();

  // If still loading auth state, return null or a loading indicator
  if (loading) {
    return <div>Loading...</div>;
  }

  // Check if the user has the required role
  const hasRequiredRole = userRole === requiredRole;

  if (!hasRequiredRole) {
    // Redirect to the specified path, keeping the current location so we can redirect back after login
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  // If the user has the required role, render the children
  return children;
};

export default ProtectedRoute; 