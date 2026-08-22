import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, ChevronDown, User, LogOut, Settings } from 'lucide-react'

export default function DashboardHeader({ onMenuToggle }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Map header title based on current route
  const getHeaderTitle = () => {
    const path = location.pathname
    if (path === '/dashboard' || path === '/dashboard/') {
      return 'Dashboard Overview'
    }
    if (path === '/dashboard/posts') {
      return profile?.role === 'contributor' ? 'My Posts' : 'All Posts'
    }
    if (path === '/dashboard/team-posts') {
      return 'Team Posts'
    }
    if (path === '/dashboard/posts/new') {
      return 'Add New Post'
    }
    if (path.startsWith('/dashboard/posts/') && path.endsWith('/edit')) {
      return 'Edit Post'
    }
    if (path === '/dashboard/review') {
      return profile?.role === 'contributor' ? 'Review Feedback' : 'Review Queue'
    }
    if (path.startsWith('/dashboard/review/')) {
      return profile?.role === 'contributor' ? 'Review Feedback' : 'Review Submission'
    }
    if (path === '/dashboard/users') {
      return 'User Management'
    }
    return 'Dashboard Overview'
  }

  // Format role for humans
  const formatRole = (roleString) => {
    if (!roleString) return 'User'
    return roleString
      .split(/[_-]+|\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const handleProfileClick = () => {
    setIsDropdownOpen(false)
    alert('Profile module is coming next.')
  }

  return (
    <header className="dashboard-header-bar">
      <div className="header-left-group">
        {/* Mobile Hamburger menu */}
        <button
          className="mobile-menu-toggle"
          onClick={onMenuToggle}
          aria-label="Open sidebar menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="header-page-title">{getHeaderTitle()}</h1>
      </div>

      <div className="header-right-group">
        {/* Profile Dropdown */}
        <div className="profile-dropdown-container" ref={dropdownRef}>
          <button
            className="profile-dropdown-trigger"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <div className="user-avatar-circle">
              {profile?.full_name
                ? profile.full_name.charAt(0).toUpperCase()
                : profile?.email
                ? profile.email.charAt(0).toUpperCase()
                : 'U'}
            </div>
            <div className="user-info-text">
              <span className="user-display-name">
                {profile?.full_name || profile?.email || 'User'}
              </span>
              <span className="user-display-role">{formatRole(profile?.role)}</span>
            </div>
            <ChevronDown size={16} className="dropdown-chevron" />
          </button>

          {isDropdownOpen && (
            <div className="profile-dropdown-menu" role="menu">
              <div className="dropdown-user-header">
                <span className="user-display-name" style={{ fontSize: '13px' }}>
                  {profile?.full_name || profile?.email || 'User'}
                </span>
                <span className="dropdown-user-email">{profile?.email}</span>
              </div>
              
              <button
                className="dropdown-menu-item"
                role="menuitem"
                onClick={handleProfileClick}
              >
                <User size={16} />
                <span>My Profile</span>
              </button>

              <button
                className="dropdown-menu-item"
                role="menuitem"
                onClick={() => {
                  setIsDropdownOpen(false)
                  alert('Settings module is coming next.')
                }}
              >
                <Settings size={16} />
                <span>Account Settings</span>
              </button>

              <button
                className="dropdown-menu-item logout"
                role="menuitem"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
