import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth hook
import LoginForm from './LoginForm'; // Import the new LoginForm component
import '../App.css'; // Make sure we have access to our CSS

function Layout() {
  const { currentUser, userId, userRole, signOut } = useAuth(); // Add userRole to destructuring
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  // Enhanced styles for buttons
  const buttonStyle = {
    padding: '10px 16px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.3s ease'
  };

  const loginButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#4285F4'
  };

  const logoutButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#d93025'
  };

  // Style for admin badge
  const adminBadgeStyle = {
    display: 'inline-block',
    backgroundColor: '#FF8C00', // Orange color for admin badge
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    marginLeft: '8px'
  };

  const userInfoStyle = {
    fontWeight: 'bold',
    fontSize: '14px',
    marginBottom: '10px',
    padding: '8px',
    backgroundColor: '#f1f3f4',
    borderRadius: '8px',
    textAlign: 'center'
  };
  
  const userIdStyle = {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
    fontWeight: 'normal'
  };

  return (
    <div className="app-container">
      {/* Right Navigation Sidebar - Now first in the DOM for proper RTL layout */}
      <nav className="sidebar">
        <h3>ניווט</h3>
        <ul className="nav-list">
          <li className="nav-item">
            <Link to="/">דף ראשי (צ'אט)</Link>
          </li>
          {/* Show Workspace Management link only for admins */}
          {userRole === 'admin' && (
            <li className="nav-item">
              <Link to="/workspaces">ניהול סביבות עבודה</Link>
            </li>
          )}
          {/* Show Admin link only if user has admin role */}
          {userRole === 'admin' && (
            <li className="nav-item">
              <Link to="/admin">ניהול מערכת</Link>
              <span style={adminBadgeStyle}>מנהל</span>
            </li>
          )}
        </ul>

        {/* Authentication Section */}
        <div className="auth-section">
          {currentUser ? (
            <>
              <div style={userInfoStyle}>
                <span>שלום, {currentUser.displayName || currentUser.email}</span>
                {userRole === 'admin' && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#FF8C00' }}>
                    מנהל מערכת
                  </div>
                )}
                <div style={userIdStyle}>
                  מזהה משתמש: {userId}
                </div>
              </div>
              <button 
                onClick={handleSignOut} 
                style={logoutButtonStyle}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'מתנתק...' : 'התנתק'}
              </button>
            </>
          ) : (
            <button 
              onClick={() => setShowLoginForm(true)} 
              style={loginButtonStyle}
            >
              התחבר
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area - Now second in the DOM for proper RTL layout */}
      <main className="main-content">
        {currentUser ? (
          <Outlet /> // Render child routes only if logged in
        ) : (
          // Show login form or login prompt
          <div style={{textAlign: 'center', marginTop: '50px'}}>
            {showLoginForm ? (
              <LoginForm />
            ) : (
              <>
                <h2>יש להתחבר כדי להשתמש באפליקציה</h2>
                <button 
                  onClick={() => setShowLoginForm(true)} 
                  style={{...loginButtonStyle, marginTop: '20px'}}
                >
                  התחבר
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default Layout;
