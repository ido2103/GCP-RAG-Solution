import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

/**
 * Admin dashboard component with admin section overview.
 */
const AdminDashboard = () => {
  const { userRole, userId, currentUser } = useAuth();
  const navigate = useNavigate();

  // Style for dashboard card
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    padding: '20px',
    margin: '0 0 20px 0',
  };

  // Style for action button
  const buttonStyle = {
    padding: '10px 15px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '10px',
  };

  const handleNavigate = (path) => {
    navigate(path);
  };

  return (
    <div className="admin-dashboard">
      <h1>לוח בקרה ניהולית</h1>
      
      <div style={cardStyle}>
        <h3>ברוך הבא, {currentUser?.displayName || currentUser?.email}</h3>
        <p>מזהה משתמש: {userId}</p>
        <p>תפקיד: {userRole === 'admin' ? 'מנהל מערכת' : 'משתמש רגיל'}</p>
      </div>

      <div style={cardStyle}>
        <h3>פעולות מרכזיות</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            style={buttonStyle}
            onClick={() => handleNavigate('/admin/users')}
          >
            ניהול משתמשים
          </button>
          <button
            style={buttonStyle}
            onClick={() => handleNavigate('/admin/groups')}
          >
            ניהול קבוצות
          </button>
          <button
            style={buttonStyle}
            onClick={() => handleNavigate('/admin/workspace-groups')}
          >
            הרשאות סביבות עבודה
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3>סקירת מערכת</h3>
        <p>מאפשר לך:</p>
        <ul>
          <li>לנהל משתמשים וקבוצות</li>
          <li>להקצות הרשאות לסביבות עבודה</li>
          <li>לנהל תפקידים (מנהל מערכת או משתמש רגיל)</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminDashboard; 