// frontend/src/components/CreateWorkspaceForm.jsx
import React, { useState } from 'react';
import { createWorkspace } from '../services/workspaceService';
import '../App.css';

// Pass a function prop 'onWorkspaceCreated' to notify the parent component
function CreateWorkspaceForm({ onWorkspaceCreated }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission
    if (!workspaceName.trim()) {
      setError("Workspace name cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Prepare data matching the backend model (add other config fields if needed)
      const newWorkspaceData = { name: workspaceName };
      const createdWorkspace = await createWorkspace(newWorkspaceData);

      setWorkspaceName(''); // Clear the input field

      // Notify the parent component that a workspace was created
      if (onWorkspaceCreated) {
        onWorkspaceCreated(createdWorkspace.workspace_id); // Pass just the ID to match what App expects
      }

    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to create workspace");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-workspace-form">
      <h3>יצירת סביבת עבודה חדשה</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="workspaceName">שם:</label>
          <input
            type="text"
            id="workspaceName"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="לדוגמה: פרויקט לקוח א'"
            disabled={isSubmitting}
            required
            className="workspace-input"
          />
        </div>
        {/* Add inputs for config options here if desired */}
        <button type="submit" disabled={isSubmitting} className="submit-button">
          {isSubmitting ? 'יוצר...' : 'צור סביבת עבודה'}
        </button>
        {error && <p className="error-text">Error: {error}</p>}
      </form>
    </div>
  );
}

export default CreateWorkspaceForm;