import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Menu, ChevronDown, User, LogOut, Settings } from 'lucide-react'

export default function DashboardHeader({ onMenuToggle }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

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
        <h1 className="header-page-title">Dashboard Overview</h1>
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
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="user-info-text">
              <span className="user-display-name">{profile?.full_name || 'Administrator'}</span>
              <span className="user-display-role">{formatRole(profile?.role)}</span>
            </div>
            <ChevronDown size={16} className="dropdown-chevron" />
          </button>

          {isDropdownOpen && (
            <div className="profile-dropdown-menu" role="menu">
              <div className="dropdown-user-header">
                <span className="user-display-name" style={{ fontSize: '13px' }}>
                  {profile?.full_name}
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
