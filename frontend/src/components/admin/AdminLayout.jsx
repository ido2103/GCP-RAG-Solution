import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Admin layout component with side navigation.
 * This component serves as a container for all admin pages.
 */
const AdminLayout = () => {
  const { userRole } = useAuth();
  const location = useLocation();

  // Check if the current route is active (for styling active nav links)
  const isActive = (path) => {
    return location.pathname === path ? 'active-nav-link' : '';
  };

  // Style for the admin container
  const adminContainerStyle = {
    display: 'flex',
    height: '100%',
    minHeight: 'calc(100vh - 60px)', // Adjust based on your main layout
  };

  // Style for the sidebar
  const sidebarStyle = {
    width: '250px',
    backgroundColor: '#f0f0f0',
    padding: '20px',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
  };

  // Style for the content area
  const contentStyle = {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
  };

  // Style for navigation links
  const navLinkStyle = {
    display: 'block',
    padding: '10px 0',
    borderBottom: '1px solid #ddd',
    textDecoration: 'none',
    color: '#333',
  };

  // Style for active navigation link
  const activeNavLinkStyle = {
    ...navLinkStyle,
    fontWeight: 'bold',
    color: '#4285F4',
  };

  return (
    <div className="admin-container" style={adminContainerStyle}>
      {/* Admin Sidebar */}
      <div className="admin-sidebar" style={sidebarStyle}>
        <h2>ניהול מערכת</h2>
        <nav className="admin-nav">
          <Link 
            to="/admin" 
            style={isActive('/admin') ? activeNavLinkStyle : navLinkStyle}
          >
            לוח בקרה
          </Link>
          <Link 
            to="/admin/users" 
            style={isActive('/admin/users') ? activeNavLinkStyle : navLinkStyle}
          >
            ניהול משתמשים
          </Link>
          <Link 
            to="/admin/groups" 
            style={isActive('/admin/groups') ? activeNavLinkStyle : navLinkStyle}
          >
            ניהול קבוצות
          </Link>
          <Link 
            to="/admin/workspace-groups" 
            style={isActive('/admin/workspace-groups') ? activeNavLinkStyle : navLinkStyle}
          >
            הרשאות סביבות עבודה
          </Link>
        </nav>

        <div style={{ marginTop: '30px', padding: '10px', backgroundColor: '#e8e8e8', borderRadius: '5px' }}>
          <p style={{ margin: '0 0 5px 0' }}>סטטוס: {userRole === 'admin' ? 'מנהל מערכת' : 'לא מורשה'}</p>
        </div>
      </div>

      {/* Admin Content Area */}
      <div className="admin-content" style={contentStyle}>
        <Outlet /> {/* This will render the nested route components */}
      </div>
    </div>
  );
};

export default AdminLayout; 