import React, { useState, useEffect } from 'react';
import { 
  listUsers, 
  deleteUser, 
  updateUserRole, 
  listGroups, 
  assignUserToGroup, 
  removeUserFromGroup 
} from '../../services/adminService';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for user actions
  const [editRoleId, setEditRoleId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // State for group assignment
  const [assignGroupId, setAssignGroupId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  
  // Status message states
  const [deleteStatus, setDeleteStatus] = useState({ message: '', isError: false });
  const [roleStatus, setRoleStatus] = useState({ message: '', isError: false });
  const [groupStatus, setGroupStatus] = useState({ message: '', isError: false });
  
  // Fetch users and groups on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [usersData, groupsData] = await Promise.all([
          listUsers(),
          listGroups()
        ]);
        console.log('Fetched Users:', usersData);
        console.log('Fetched Groups:', groupsData);
        setUsers(usersData);
        setGroups(groupsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle role edit mode
  const startEditRole = (userId, currentRole) => {
    setEditRoleId(userId);
    setSelectedRole(currentRole);
    setRoleStatus({ message: '', isError: false });
  };
  
  // Cancel role edit
  const cancelEditRole = () => {
    setEditRoleId(null);
    setSelectedRole('');
    setRoleStatus({ message: '', isError: false });
  };
  
  // Save role change
  const saveRoleChange = async (userId) => {
    setRoleStatus({ message: 'מעדכן תפקיד...', isError: false });
    try {
      await updateUserRole(userId, selectedRole);
      
      // Update user in state
      setUsers(users.map(user => {
        if (user.user_id === userId) {
          return { ...user, role: selectedRole };
        }
        return user;
      }));
      
      setEditRoleId(null);
      setRoleStatus({ message: 'התפקיד עודכן בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setRoleStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error updating role:', err);
      setRoleStatus({ message: 'שגיאה בעדכון התפקיד', isError: true });
    }
  };
  
  // Start group assignment
  const startAssignGroup = (userId) => {
    setAssignGroupId(userId);
    setSelectedGroupId('');
    setGroupStatus({ message: '', isError: false });
  };
  
  // Cancel group assignment
  const cancelAssignGroup = () => {
    setAssignGroupId(null);
    setSelectedGroupId('');
    setGroupStatus({ message: '', isError: false });
  };
  
  // Add a function to refresh user data
  const refreshUsers = async () => {
    try {
      setLoading(true);
      const usersData = await listUsers();
      console.log('Refreshed users data:', usersData);
      setUsers(usersData);
    } catch (err) {
      console.error('Error refreshing users:', err);
      setGroupStatus({ message: 'שגיאה בטעינת נתוני משתמשים מעודכנים', isError: true });
    } finally {
      setLoading(false);
    }
  };
  
  // Save group assignment
  const saveGroupAssignment = async (userId) => {
    if (!selectedGroupId) {
      setGroupStatus({ message: 'יש לבחור קבוצה', isError: true });
      return;
    }
    
    // Find the user from state to get current groups
    const user = users.find(u => u.user_id === userId);
    if (!user) {
      setGroupStatus({ message: 'שגיאה: לא נמצא משתמש', isError: true });
      return;
    }
    
    // Convert current group IDs/Names to a list of names
    const currentGroupNames = (user.groups || [])
      .map(groupIdOrName => {
        const group = groups.find(g => g.group_id === groupIdOrName || g.group_name === groupIdOrName);
        return group ? group.group_name : null;
      })
      .filter(name => name !== null);
      
    console.log('Passing to assignUserToGroup:', userId, selectedGroupId, currentGroupNames);
    
    setGroupStatus({ message: 'משייך לקבוצה...', isError: false });
    try {
      // Pass the current group names to the service function
      await assignUserToGroup(userId, selectedGroupId, currentGroupNames);
      
      // Refresh user data to get updated group assignments
      await refreshUsers();
      
      setAssignGroupId(null);
      setGroupStatus({ message: 'המשתמש שויך לקבוצה בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setGroupStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error assigning user to group:', err);
      setGroupStatus({ message: 'שגיאה בשיוך המשתמש לקבוצה', isError: true });
    }
  };
  
  // Remove user from group
  const removeFromGroup = async (userId, groupIdToRemove) => {
    // Find the user from state to get current groups
    const user = users.find(u => u.user_id === userId);
    if (!user) {
      setGroupStatus({ message: 'שגיאה: לא נמצא משתמש', isError: true });
      return;
    }
    
    // Convert current group IDs/Names to a list of names
    const currentGroupNames = (user.groups || [])
      .map(groupIdOrName => {
        const group = groups.find(g => g.group_id === groupIdOrName || g.group_name === groupIdOrName);
        return group ? group.group_name : null;
      })
      .filter(name => name !== null);
      
    console.log('Passing to removeUserFromGroup:', userId, groupIdToRemove, currentGroupNames);
    
    setGroupStatus({ message: 'מסיר מהקבוצה...', isError: false });
    try {
      // Pass the current group names to the service function
      await removeUserFromGroup(userId, groupIdToRemove, currentGroupNames);
      
      // Refresh user data to get updated group assignments
      await refreshUsers();
      
      setGroupStatus({ message: 'המשתמש הוסר מהקבוצה בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setGroupStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error removing user from group:', err);
      setGroupStatus({ message: 'שגיאה בהסרת המשתמש מהקבוצה', isError: true });
    }
  };
  
  // Handle delete confirmation
  const confirmDelete = (userId) => {
    setDeleteConfirmId(userId);
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Cancel delete
  const cancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteStatus({ message: '', isError: false });
  };
  
  // Handle user deletion
  const handleDeleteUser = async (userId) => {
    setDeleteStatus({ message: 'מוחק משתמש...', isError: false });
    try {
      await deleteUser(userId);
      
      // Remove deleted user from state
      setUsers(users.filter(user => user.user_id !== userId));
      
      setDeleteConfirmId(null);
      setDeleteStatus({ message: 'המשתמש נמחק בהצלחה', isError: false });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setDeleteStatus({ message: '', isError: false });
      }, 3000);
    } catch (err) {
      console.error('Error deleting user:', err);
      setDeleteStatus({ message: 'שגיאה במחיקת המשתמש', isError: true });
    }
  };
  
  // Get group name by id
  const getGroupName = (groupId) => {
    console.log(`Looking for group with ID: ${groupId}`);
    console.log('Available groups:', groups);
    const group = groups.find(g => g.group_id === groupId);
    if (!group) {
      console.log(`Group with ID ${groupId} not found`);
    }
    return group ? group.group_name : `קבוצה לא ידועה (ID: ${groupId})`;
  };
  
  // Get user groups
  const getUserGroups = (user) => {
    if (!user.groups || user.groups.length === 0) {
      return <span style={{ color: '#888' }}>לא משויך לקבוצות</span>;
    }
    
    console.log('User groups:', user.groups);
    
    return (
      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
        {user.groups.map(groupIdOrName => {
          // Check if this is a UUID (group ID) or just a name
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrName);
          
          let groupName, groupId;
          
          if (isUuid) {
            // If it's a UUID, find the corresponding group name
            groupId = groupIdOrName;
            const group = groups.find(g => g.group_id === groupId);
            groupName = group ? group.group_name : `קבוצה לא ידועה (ID: ${groupId})`;
          } else {
            // If it's already a name, use it directly
            groupName = groupIdOrName;
            // Find the corresponding group ID if available
            const group = groups.find(g => g.group_name === groupName);
            groupId = group ? group.group_id : groupName; // Fall back to using the name as ID
          }
          
          return (
            <li key={groupId} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
              {groupName}
              <button 
                onClick={() => removeFromGroup(user.user_id, groupId)}
                style={{
                  marginLeft: '10px',
                  padding: '2px 6px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              >
                הסר
              </button>
            </li>
          );
        })}
      </ul>
    );
  };
  
  // Style for card
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    padding: '15px',
    marginBottom: '15px',
  };
  
  // Style for info box
  const infoBoxStyle = {
    ...cardStyle,
    backgroundColor: '#e8f4fd',
    border: '1px solid #a6d2fb',
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
  
  if (loading && users.length === 0) return <div>טוען נתונים...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  
  return (
    <div className="user-management">
      <h1>ניהול משתמשים</h1>
      
      {/* Info box about user creation */}
      <div style={infoBoxStyle}>
        <h3>מידע על יצירת משתמשים</h3>
        <p>משתמשים חדשים צריכים להירשם דרך מערכת האימות של <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">Firebase</a>.</p>
        <p>לאחר הרשמה, הם יופיעו כאן לניהול הרשאות ושיוך לקבוצות.</p>
      </div>
      
      
      <h3>משתמשים קיימים ({users.length})</h3>
      
      {/* Status messages */}
      {deleteStatus.message && (
        <div style={deleteStatus.isError ? errorStyle : successStyle}>
          {deleteStatus.message}
        </div>
      )}
      
      {roleStatus.message && (
        <div style={roleStatus.isError ? errorStyle : successStyle}>
          {roleStatus.message}
        </div>
      )}
      
      {groupStatus.message && (
        <div style={groupStatus.isError ? errorStyle : successStyle}>
          {groupStatus.message}
        </div>
      )}
      
      {/* User list */}
      {users.map(user => (
        <div key={user.user_id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <h3>{user.name}</h3>
              <p><strong>דוא"ל:</strong> {user.email}</p>
              
              {/* Role section */}
              <div style={{ marginBottom: '10px' }}>
                <strong>תפקיד:</strong>{' '}
                {editRoleId === user.user_id ? (
                  <div style={{ marginTop: '5px' }}>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      style={{ padding: '5px' }}
                    >
                      <option value="user">משתמש רגיל</option>
                      <option value="admin">מנהל</option>
                    </select>
                    <button 
                      onClick={() => saveRoleChange(user.user_id)}
                      style={{ ...buttonStyle, padding: '5px 10px', fontSize: '12px' }}
                    >
                      שמור
                    </button>
                    <button 
                      onClick={cancelEditRole}
                      style={{ ...cancelButtonStyle, padding: '5px 10px', fontSize: '12px' }}
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <span>
                    {user.role === 'admin' ? 'מנהל' : 'משתמש רגיל'}{' '}
                    <button 
                      onClick={() => startEditRole(user.user_id, user.role)}
                      style={{ 
                        marginLeft: '10px',
                        padding: '2px 6px',
                        backgroundColor: '#4285F4',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      ערוך
                    </button>
                  </span>
                )}
              </div>
              
              {/* Groups section */}
              <div>
                <strong>קבוצות:</strong>
                {getUserGroups(user)}
                
                {assignGroupId === user.user_id ? (
                  <div style={{ marginTop: '5px' }}>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      style={{ padding: '5px' }}
                    >
                      <option value="">בחר קבוצה</option>
                      {groups.map(group => (
                        <option key={group.group_id} value={group.group_id}>
                          {group.group_name}
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={() => saveGroupAssignment(user.user_id)}
                      style={{ ...buttonStyle, padding: '5px 10px', fontSize: '12px' }}
                    >
                      שייך
                    </button>
                    <button 
                      onClick={cancelAssignGroup}
                      style={{ ...cancelButtonStyle, padding: '5px 10px', fontSize: '12px' }}
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => startAssignGroup(user.user_id)}
                    style={{ 
                      marginTop: '5px',
                      padding: '5px 10px',
                      backgroundColor: '#4285F4',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    שייך לקבוצה
                  </button>
                )}
              </div>
              
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                מזהה: {user.user_id}
              </p>
            </div>
            
            <div>
              {deleteConfirmId === user.user_id ? (
                <div>
                  <p style={{ fontWeight: 'bold', color: '#d93025' }}>בטוח למחוק?</p>
                  <button
                    style={deleteButtonStyle}
                    onClick={() => handleDeleteUser(user.user_id)}
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
                  onClick={() => confirmDelete(user.user_id)}
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {users.length === 0 && !loading && (
        <p>אין משתמשים להצגה.</p>
      )}
    </div>
  );
};

export default UserManagement; 