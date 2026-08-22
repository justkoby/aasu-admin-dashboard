import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute — redirects unauthenticated users to /login.
 * Wrap any route that requires a valid session.
 */
export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-loader-container">
        <div className="auth-loader"></div>
        <p>Verifying session...</p>
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * RoleRoute — redirects users whose role is not in allowedRoles to /dashboard.
 * Must be nested inside a ProtectedRoute so auth is already verified.
 */
export function RoleRoute({ children, allowedRoles = [] }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-loader-container">
        <div className="auth-loader"></div>
        <p>Verifying access...</p>
      </div>
    )
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
