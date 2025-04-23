import React, { useState } from 'react';
import UserManagement from './UserManagement';
import GroupManagement from './GroupManagement';
import WorkspaceManagement from './WorkspaceManagement';
import WorkspaceGroupPermissions from './WorkspaceGroupPermissions';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users');

  const handleTabClick = (tabName) => {
    console.log(`Setting active tab to: ${tabName}`);
    setActiveTab(tabName);
  }

  const renderContent = () => {
    console.log(`Rendering content for active tab: ${activeTab}`);
    switch (activeTab) {
      case 'users':
        return <UserManagement />;
      case 'groups':
        return <GroupManagement />;
      case 'workspaces':
        return <WorkspaceManagement />;
      case 'workspace_permissions':
        return <WorkspaceGroupPermissions />;
      default:
        return <UserManagement />;
    }
  };

  // Basic styling for tabs
  const tabStyle = {
    padding: '10px 15px',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    marginRight: '10px',
    fontWeight: '500',
    color: '#555',
  };

  const activeTabStyle = {
    ...tabStyle,
    color: '#4285F4',
    borderBottom: '3px solid #4285F4',
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>פאנל ניהול</h1>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #eee' }}>
        <button 
          style={activeTab === 'users' ? activeTabStyle : tabStyle}
          onClick={() => handleTabClick('users')}
        >
          ניהול משתמשים
        </button>
        <button 
          style={activeTab === 'groups' ? activeTabStyle : tabStyle}
          onClick={() => handleTabClick('groups')}
        >
          ניהול קבוצות
        </button>
        <button 
          style={activeTab === 'workspaces' ? activeTabStyle : tabStyle}
          onClick={() => handleTabClick('workspaces')}
        >
          ניהול מרחבי עבודה
        </button>
        <button 
          style={activeTab === 'workspace_permissions' ? activeTabStyle : tabStyle}
          onClick={() => handleTabClick('workspace_permissions')}
        >
          הרשאות מרחבי עבודה
        </button>
      </div>
      
      {renderContent()}
    </div>
  );
};

export default AdminPanel; 