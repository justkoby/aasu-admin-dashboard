import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute, { RoleRoute } from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PostsPage from './pages/PostsPage'
import PostEditorPage from './pages/PostEditorPage'
import ReviewQueuePage from './pages/ReviewQueuePage'
import ReviewPostPage from './pages/ReviewPostPage'
import UsersPage from './pages/UsersPage'
import TeamPostsPage from './pages/TeamPostsPage'
import CategoriesPage from './pages/CategoriesPage'
import MediaLibraryPage from './pages/MediaLibraryPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Root redirect to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Public login page */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected dashboard — all authenticated users land here */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* Main dashboard (role-aware: DashboardPage handles supervisor branch internally) */}
            <Route index element={<DashboardPage />} />

            {/* Content-Management Module routes (all authenticated users) */}
            <Route path="posts" element={<PostsPage />} />
            <Route path="posts/new" element={<PostEditorPage />} />
            <Route path="posts/:id/edit" element={<PostEditorPage />} />

            {/* Media Library (all authenticated roles with role-scoped assets) */}
            <Route path="media" element={<MediaLibraryPage />} />

            {/* Supervisor-scoped team posts view */}
            <Route
              path="team-posts"
              element={
                <RoleRoute allowedRoles={['supervisor']}>
                  <TeamPostsPage />
                </RoleRoute>
              }
            />

            {/* Editorial Review Workflow (admin + supervisor = canReview; contributor sees feedback) */}
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="review/:id" element={<ReviewPostPage />} />

            {/* Super Admin & Communications Admin — Categories Management */}
            <Route
              path="categories"
              element={
                <RoleRoute allowedRoles={['super_admin', 'communications_admin']}>
                  <CategoriesPage />
                </RoleRoute>
              }
            />

            {/* Super Admin — User Management */}
            <Route
              path="users"
              element={
                <RoleRoute allowedRoles={['super_admin']}>
                  <UsersPage />
                </RoleRoute>
              }
            />
          </Route>

          {/* Fallback redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
