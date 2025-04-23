import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './reset.css';
import './index.css';

import Layout from './components/Layout';
import ChatPage from './components/ChatPage';
import WorkspaceManagementPage from './components/WorkspaceManagementPage';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './components/admin/AdminDashboard';
import UserManagement from './components/admin/UserManagement';
import GroupManagement from './components/admin/GroupManagement';
import WorkspaceGroupPermissions from './components/admin/WorkspaceGroupPermissions';


createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ChatPage />} />
            <Route path="workspaces" element={
              <ProtectedRoute requiredRole="admin">
                <WorkspaceManagementPage />
              </ProtectedRoute>
            } />
            
            {/* Admin Routes - Protected by admin role check */}
            <Route path="admin" element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }>
              {/* Nested admin routes */}
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="groups" element={<GroupManagement />} />
              <Route path="workspace-groups" element={<WorkspaceGroupPermissions />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
