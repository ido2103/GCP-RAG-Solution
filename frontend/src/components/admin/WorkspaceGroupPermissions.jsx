import React, { useState, useEffect } from 'react';
import { 
  listWorkspaces, 
  listGroups, 
  getAllWorkspaceGroupAssignments, 
  assignGroupsToWorkspace 
} from '../../services/adminService';

const WorkspaceGroupPermissions = () => {
  const [workspaces, setWorkspaces] = useState([]);
  const [groups, setGroups] = useState([]);
  // Store assignments as a map for easy lookup: { workspaceId: [groupId1, groupId2, ...] }
  const [assignments, setAssignments] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ message: '', isError: false });

  // State to track changes made in the UI before saving
  // Format: { workspaceId: [groupId1, groupId2, ...] }
  const [pendingAssignments, setPendingAssignments] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [workspacesData, groupsData, assignmentsData] = await Promise.all([
          listWorkspaces(),
          listGroups(),
          getAllWorkspaceGroupAssignments()
        ]);
        
        setWorkspaces(workspacesData);
        setGroups(groupsData);
        
        // Process assignments data into the map format
        const assignmentsMap = {};
        assignmentsData.forEach(assignment => {
          if (!assignmentsMap[assignment.workspace_id]) {
            assignmentsMap[assignment.workspace_id] = [];
          }
          assignmentsMap[assignment.workspace_id].push(assignment.group_id);
        });
        setAssignments(assignmentsMap);
        setPendingAssignments(assignmentsMap); // Initialize pending state with current assignments

      } catch (err) {
        console.error('Error fetching permissions data:', err);
        setError('Failed to load workspace/group permission data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleCheckboxChange = (workspaceId, groupId) => {
    setPendingAssignments(prev => {
      const currentWorkspaceGroups = prev[workspaceId] || [];
      let updatedGroups;
      if (currentWorkspaceGroups.includes(groupId)) {
        // Remove group
        updatedGroups = currentWorkspaceGroups.filter(id => id !== groupId);
      } else {
        // Add group
        updatedGroups = [...currentWorkspaceGroups, groupId];
      }
      // Return new state object with the updated workspace entry
      return {
        ...prev,
        [workspaceId]: updatedGroups
      };
    });
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveStatus({ message: '', isError: false });
    let successCount = 0;
    let errorCount = 0;
    const totalChanges = Object.keys(pendingAssignments).filter(
      wsId => JSON.stringify(pendingAssignments[wsId]?.sort()) !== JSON.stringify(assignments[wsId]?.sort())
    ).length;

    setSaveStatus({ message: `Saving ${totalChanges} workspace permission changes...`, isError: false });

    // Iterate through pending assignments and save changes for each workspace
    for (const workspaceId in pendingAssignments) {
      // Check if the assignment actually changed compared to the original
      const originalGroups = assignments[workspaceId] || [];
      const pendingGroups = pendingAssignments[workspaceId] || [];

      // Compare sorted arrays to ignore order differences
      if (JSON.stringify(originalGroups.slice().sort()) !== JSON.stringify(pendingGroups.slice().sort())) {
        try {
          console.log(`Saving changes for workspace ${workspaceId}:`, pendingGroups);
          await assignGroupsToWorkspace(workspaceId, pendingGroups);
          successCount++;
        } catch (err) {
          console.error(`Error saving permissions for workspace ${workspaceId}:`, err);
          errorCount++;
          // Keep processing other workspaces even if one fails
        }
      }
    }

    setIsSaving(false);
    
    // Update the original assignments state to match the saved state
    setAssignments(pendingAssignments);

    if (errorCount > 0) {
      setSaveStatus({ 
        message: `Completed with errors. ${successCount} saved successfully, ${errorCount} failed.`, 
        isError: true 
      });
    } else if (successCount > 0) {
      setSaveStatus({ message: `Successfully saved permissions for ${successCount} workspace(s).`, isError: false });
      // Clear message after a delay
      setTimeout(() => setSaveStatus({ message: '', isError: false }), 4000);
    } else {
      setSaveStatus({ message: 'No changes detected to save.', isError: false });
       // Clear message after a delay
      setTimeout(() => setSaveStatus({ message: '', isError: false }), 3000);
    }
  };

  // --- Styles ---
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
    fontSize: '14px',
  };

  const thStyle = {
    border: '1px solid #ccc',
    padding: '10px',
    textAlign: 'left',
    backgroundColor: '#e0e0e0',
    color: '#000000',
    position: 'sticky',
    top: 0,
    zIndex: 1
  };
  
  const tdStyle = {
    border: '1px solid #ccc',
    padding: '10px',
    textAlign: 'center',
    backgroundColor: '#f9f9f9',
    color: '#000000',
  };

  const workspaceNameStyle = {
     textAlign: 'right',
     fontWeight: 'bold',
     color: '#000000',
  };
  
  const checkboxStyle = {
    cursor: 'pointer',
  };
  
  const saveButtonStyle = {
    padding: '10px 15px',
    marginTop: '20px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  };
  
  // Style for status message
  const statusStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    marginTop: '15px',
    fontSize: '14px',
    display: 'inline-block',
    marginLeft: '15px',
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

  // --- Render Logic ---
  if (loading) return <div>טוען נתוני הרשאות...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  const hasChanges = JSON.stringify(assignments) !== JSON.stringify(pendingAssignments);

  return (
    <div className="workspace-group-permissions">
      <h1>ניהול הרשאות קבוצה-מרחב עבודה</h1>
      <p>סמן את התיבות כדי להעניק לקבוצה גישה למרחב עבודה ספציפי.</p>

      {workspaces.length === 0 || groups.length === 0 ? (
        <p>יש ליצור לפחות מרחב עבודה אחד וקבוצה אחת כדי לנהל הרשאות.</p>
      ) : (
        <>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{...thStyle, textAlign: 'right'}}>מרחב עבודה</th>
                {groups.map(group => (
                  <th key={group.group_id} style={thStyle}>{group.group_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspaces.map(workspace => (
                <tr key={workspace.workspace_id}>
                  <td style={{...tdStyle, ...workspaceNameStyle}}>{workspace.name}</td>
                  {groups.map(group => {
                    const isChecked = pendingAssignments[workspace.workspace_id]?.includes(group.group_id) || false;
                    return (
                      <td key={group.group_id} style={tdStyle}>
                        <input
                          type="checkbox"
                          style={checkboxStyle}
                          checked={isChecked}
                          onChange={() => handleCheckboxChange(workspace.workspace_id, group.group_id)}
                          disabled={isSaving}
                          aria-label={`Assign group ${group.group_name} to workspace ${workspace.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <button 
              style={saveButtonStyle}
              onClick={handleSaveChanges}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? 'שומר שינויים...' : 'שמור שינויים'}
            </button>
            {saveStatus.message && (
              <span style={saveStatus.isError ? errorStyle : successStyle}>
                {saveStatus.message}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WorkspaceGroupPermissions; 