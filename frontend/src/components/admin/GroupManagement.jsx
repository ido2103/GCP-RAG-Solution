import React, { useState, useEffect } from 'react';
import { listGroups, createGroup, deleteGroup } from '../../services/adminService';

const GroupManagement = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for new group form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // State for delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // Status message states
  const [createStatus, setCreateStatus] = useState({ message: '', isError: false });
  const [deleteStatus, setDeleteStatus] = useState({ message: '', isError: false });
  
  // Fetch groups on component mount
  useEffect(() => {
    fetchGroups();
  }, []);
  
  // Function to fetch groups
  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await listGroups();
      setGroups(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Failed to load groups. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle group creation
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    
    if (!newGroupName.trim()) {
      setCreateStatus({ message: 'יש להזין שם קבוצה', isError: true });
      return;
    }
    
    setIsCreating(true);
    setCreateStatus({ message: 'יוצר קבוצה...', isError: false });
    
    try {
      const groupData = {
        group_name: newGroupName.trim(),
        description: newGroupDescription.trim() || null
      };
      
      const createdGroup = await createGroup(groupData);
      
      // Add new group to state
      setGroups([...groups, createdGroup]);
      
      // Reset form
      setNewGroupName('');
      setNewGroupDescription('');
      
      setCreateStatus({ message: 'הקבוצה נוצרה בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setCreateStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error creating group:', err);
      setCreateStatus({ message: 'שגיאה ביצירת הקבוצה', isError: true });
    } finally {
      setIsCreating(false);
    }
  };
  
  // Handle delete confirmation
  const confirmDelete = (groupId) => {
    setDeleteConfirmId(groupId);
    // Clear any status messages
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Handle group deletion
  const handleDeleteGroup = async (groupId) => {
    setDeleteStatus({ message: 'מוחק קבוצה...', isError: false });
    try {
      await deleteGroup(groupId);
      
      // Remove deleted group from state
      setGroups(groups.filter(group => group.group_id !== groupId));
      
      setDeleteStatus({ message: 'הקבוצה נמחקה בהצלחה', isError: false });
      
      // Clear confirmation after successful deletion
      setDeleteConfirmId(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setDeleteStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error deleting group:', err);
      setDeleteStatus({ message: 'שגיאה במחיקת הקבוצה', isError: true });
    }
  };
  
  // Style for card
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    padding: '15px',
    marginBottom: '15px',
  };
  
  // Style for form
  const formStyle = {
    ...cardStyle,
    backgroundColor: '#f5f5f5',
  };
  
  // Style for button
  const buttonStyle = {
    padding: '8px 12px',
    margin: '0 5px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };
  
  // Style for delete button
  const deleteButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#d93025',
  };
  
  // Style for cancel button
  const cancelButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#757575',
  };
  
  // Style for input
  const inputStyle = {
    width: '100%',
    padding: '8px',
    marginBottom: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  };
  
  // Style for status message
  const statusStyle = {
    padding: '8px',
    borderRadius: '4px',
    marginTop: '8px',
    fontSize: '14px',
  };
  
  // Style for success message
  const successStyle = {
    ...statusStyle,
    backgroundColor: '#e6f7e6',
    color: '#2e7d32',
  };
  
  // Style for error message
  const errorStyle = {
    ...statusStyle,
    backgroundColor: '#fdecea',
    color: '#c62828',
  };
  
  if (loading && groups.length === 0) return <div>טוען קבוצות...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  
  return (
    <div className="group-management">
      <h1>ניהול קבוצות</h1>
      
      {/* Create group form */}
      <div style={formStyle}>
        <h3>יצירת קבוצה חדשה</h3>
        <form onSubmit={handleCreateGroup}>
          <div>
            <label htmlFor="group-name">שם הקבוצה *</label>
            <input
              id="group-name"
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="הזן שם קבוצה"
              style={inputStyle}
              required
            />
          </div>
          
          <div>
            <label htmlFor="group-description">תיאור (אופציונלי)</label>
            <input
              id="group-description"
              type="text"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              placeholder="הזן תיאור קבוצה"
              style={inputStyle}
            />
          </div>
          
          <button
            type="submit"
            style={buttonStyle}
            disabled={isCreating || !newGroupName.trim()}
          >
            {isCreating ? 'יוצר קבוצה...' : 'צור קבוצה'}
          </button>
          
          {/* Create status message */}
          {createStatus.message && (
            <div style={createStatus.isError ? errorStyle : successStyle}>
              {createStatus.message}
            </div>
          )}
        </form>
      </div>
      
      <h3>קבוצות קיימות ({groups.length})</h3>
      
      {/* Delete status message (global) */}
      {deleteStatus.message && (
        <div style={deleteStatus.isError ? errorStyle : successStyle}>
          {deleteStatus.message}
        </div>
      )}
      
      {/* Group list */}
      {groups.map(group => (
        <div key={group.group_id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3>{group.group_name}</h3>
              {group.description && (
                <p>{group.description}</p>
              )}
              <p style={{ fontSize: '12px', color: '#666' }}>
                מזהה: {group.group_id}
              </p>
            </div>
            
            <div>
              {deleteConfirmId === group.group_id ? (
                <div>
                  <p style={{ fontWeight: 'bold', color: '#d93025' }}>בטוח למחוק?</p>
                  <button
                    style={deleteButtonStyle}
                    onClick={() => handleDeleteGroup(group.group_id)}
                  >
                    כן, מחק
                  </button>
                  <button
                    style={cancelButtonStyle}
                    onClick={cancelDelete}
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  style={deleteButtonStyle}
                  onClick={() => confirmDelete(group.group_id)}
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {groups.length === 0 && !loading && (
        <p>אין קבוצות להצגה.</p>
      )}
    </div>
  );
};

export default GroupManagement; 