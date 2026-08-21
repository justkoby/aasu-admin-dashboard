import React from 'react'
import { useAuth } from '../context/AuthContext'
import '../styles/auth.css'

export default function DashboardPage() {
  const { profile, signOut } = useAuth()

  const formatRole = (roleString) => {
    if (!roleString) return 'User'
    return roleString
      .split(/[_-]+|\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  return (
    <div className="dashboard-container">
      {/* Dashboard Header/Navbar */}
      <header className="dashboard-header">
        <div className="header-logo-section">
          <img src="/aasu-logo.png" alt="AASU Logo" className="dashboard-header-logo" />
          <span className="header-title">AASU Admin Dashboard</span>
        </div>
        <button className="logout-button-header" onClick={handleLogout}>
          Sign Out
        </button>
      </header>

      {/* Main Content Dashboard */}
      <main className="dashboard-main">
        <div className="dashboard-card">
          <div className="profile-badge-avatar">
            {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'A'}
          </div>
          
          <h1 className="welcome-text">Welcome, {profile?.full_name || 'Administrator'}</h1>
          <p className="dashboard-subtitle">Authenticated Admin Session Overview</p>

          <div className="profile-details-grid">
            <div className="detail-item">
              <span className="detail-label">Email Address</span>
              <span className="detail-value">{profile?.email || 'N/A'}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Role</span>
              <span className="detail-value role-badge">
                {formatRole(profile?.role)}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Account Status</span>
              <span className="detail-value status-badge active">
                Active
              </span>
            </div>
          </div>

          <div className="cms-status-indicator">
            <div className="status-dot pulsing"></div>
            <span className="status-text">
              AASU CMS Connection is working successfully. Secured by Supabase RLS.
            </span>
          </div>

          <div className="dashboard-actions">
            <button className="logout-button-main" onClick={handleLogout}>
              Sign Out Securely
            </button>
          </div>
        </div>
      </main>

      <footer className="dashboard-footer">
        <p>&copy; {new Date().getFullYear()} All-Africa Students Union. All rights reserved.</p>
      </footer>
    </div>
  )
}
