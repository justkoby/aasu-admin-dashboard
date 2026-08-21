import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ClipboardList,
  FolderKanban,
  Image,
  Users,
  History,
  User,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react'

export default function Sidebar({ isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  const { profile } = useAuth()
  const location = useLocation()
  const userRole = profile?.role || 'contributor'
  const isAdminRole = userRole === 'super_admin' || userRole === 'communications_admin'

  // Number of posts awaiting review — shown as a badge for administrators
  const [reviewCount, setReviewCount] = useState(0)

  useEffect(() => {
    if (!isAdminRole) return
    let isMounted = true

    const fetchReviewCount = async () => {
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_review')

      if (!error && isMounted) {
        setReviewCount(count || 0)
      }
    }

    fetchReviewCount()
    return () => {
      isMounted = false
    }
    // Re-count whenever the user navigates so the badge stays fresh
  }, [isAdminRole, location.pathname])

  // Helper to determine if link is active in routing
  const isActive = (path) => location.pathname === path

  // Helper to render sidebar items
  const renderItem = (label, icon, path, comingNext = false, count = 0) => {
    const active = isActive(path)
    
    const content = (
      <>
        <div className="sidebar-nav-item-content">
          {icon}
          <span className="sidebar-nav-text">{label}</span>
        </div>
        {comingNext && !isCollapsed && (
          <span className="coming-soon-badge">Coming next</span>
        )}
        {!comingNext && count > 0 && (
          <span className="review-count-badge" title={`${count} awaiting review`}>{count}</span>
        )}
      </>
    )

    if (comingNext) {
      return (
        <button
          key={label}
          className={`sidebar-nav-item ${active ? 'active' : ''}`}
          onClick={() => alert(`${label} module is coming in the next release.`)}
          title={label}
        >
          {content}
        </button>
      )
    }

    return (
      <Link
        key={label}
        to={path}
        className={`sidebar-nav-item ${active ? 'active' : ''}`}
        onClick={onCloseMobile}
        title={label}
      >
        {content}
      </Link>
    )
  }

  // Get navigation links based on user role
  const getNavSections = () => {
    const sections = []

    // 1. Overview Section (Available to all)
    sections.push({
      label: 'Overview',
      items: [
        {
          label: 'Dashboard',
          icon: <LayoutDashboard size={20} className="sidebar-icon" />,
          path: '/dashboard',
          comingNext: false
        }
      ]
    })

    // 2. Content Section
    const contentItems = []
    
    if (userRole === 'super_admin' || userRole === 'communications_admin') {
      contentItems.push({
        label: 'All Posts',
        icon: <FileText size={20} className="sidebar-icon" />,
        path: '/dashboard/posts',
        comingNext: false
      })
    } else {
      // Contributor role
      contentItems.push({
        label: 'My Posts',
        icon: <FileText size={20} className="sidebar-icon" />,
        path: '/dashboard/posts',
        comingNext: false
      })
    }

    contentItems.push({
      label: 'Add New Post',
      icon: <PlusCircle size={20} className="sidebar-icon" />,
      path: '/dashboard/posts/new',
      comingNext: false
    })

    if (userRole === 'super_admin' || userRole === 'communications_admin') {
      contentItems.push({
        label: 'Review Queue',
        icon: <ClipboardList size={20} className="sidebar-icon" />,
        path: '/dashboard/review',
        comingNext: false,
        count: reviewCount
      })
    } else {
      // Contributor role
      contentItems.push({
        label: 'Review Feedback',
        icon: <ClipboardList size={20} className="sidebar-icon" />,
        path: '/dashboard/review',
        comingNext: false
      })
    }

    if (userRole === 'super_admin' || userRole === 'communications_admin') {
      contentItems.push({
        label: 'Categories',
        icon: <FolderKanban size={20} className="sidebar-icon" />,
        path: '/dashboard/categories',
        comingNext: true
      })
      contentItems.push({
        label: 'Media Library',
        icon: <Image size={20} className="sidebar-icon" />,
        path: '/dashboard/media',
        comingNext: true
      })
    }

    sections.push({
      label: 'Content',
      items: contentItems
    })

    // 3. Administration Section
    const adminItems = []
    
    if (userRole === 'super_admin') {
      adminItems.push({
        label: 'Users',
        icon: <Users size={20} className="sidebar-icon" />,
        path: '/dashboard/users',
        comingNext: true
      })
    }

    if (userRole === 'super_admin' || userRole === 'communications_admin') {
      adminItems.push({
        label: 'Activity Log',
        icon: <History size={20} className="sidebar-icon" />,
        path: '/dashboard/activity',
        comingNext: true
      })
    }

    if (adminItems.length > 0) {
      sections.push({
        label: 'Administration',
        items: adminItems
      })
    }

    // 4. Settings Section (Available to all)
    sections.push({
      label: 'Settings',
      items: [
        {
          label: 'Profile',
          icon: <User size={20} className="sidebar-icon" />,
          path: '/dashboard/profile',
          comingNext: true
        }
      ]
    })

    return sections
  }

  return (
    <aside className={`dashboard-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Brand Logo Header */}
      <div className="sidebar-brand-section">
        <Link to="/dashboard" className="sidebar-logo-link" onClick={onCloseMobile}>
          <img src="/aasu-logo.png" alt="AASU Logo" className="sidebar-logo-img" />
          <span className="sidebar-logo-text">AASU CMS</span>
        </Link>
        
        {/* Toggle Collapse Button (Hidden on Mobile) */}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        {/* Close Button on Mobile Drawer */}
        <button
          className="sidebar-collapse-btn mobile-only-close"
          onClick={onCloseMobile}
          aria-label="Close menu"
          style={{ display: 'none' }} /* controlled by responsive CSS or display logic */
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav-container">
        {getNavSections().map((section) => (
          <div key={section.label} className="sidebar-group">
            <span className="sidebar-group-label">{section.label}</span>
            <div className="sidebar-group-links">
              {section.items.map((item) =>
                renderItem(item.label, item.icon, item.path, item.comingNext, item.count || 0)
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapsed Sidebar User Badge */}
      {isCollapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-collapsed-avatar">
            {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'A'}
          </div>
        </div>
      )}
    </aside>
  )
}
