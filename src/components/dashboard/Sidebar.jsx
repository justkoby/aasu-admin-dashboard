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
  X,
  Briefcase,
  Trash2
} from 'lucide-react'

export default function Sidebar({ isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  const { profile } = useAuth()
  const location = useLocation()
  const userRole = profile?.role || 'contributor'
  const isAdminRole = userRole === 'super_admin' || userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'

  // Review / feedback badge count
  const [reviewCount, setReviewCount] = useState(0)

  useEffect(() => {
    let isMounted = true

    const fetchBadgeCount = async () => {
      if (isAdminRole) {
        // Admin: all posts awaiting review
        const { count, error } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_review')
        if (!error && isMounted) setReviewCount(count || 0)
      } else if (isSupervisor && profile?.id) {
        // Supervisor: posts assigned to them specifically
        const { count, error } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_review')
          .eq('assigned_reviewer_id', profile.id)
        if (!error && isMounted) setReviewCount(count || 0)
      } else if (profile?.id) {
        // Contributor: own drafts with review notes (changes requested)
        const { data, error } = await supabase
          .from('posts')
          .select('id, review_notes!inner(id)')
          .eq('author_id', profile.id)
          .eq('status', 'draft')
        if (isMounted) setReviewCount(error ? 0 : (data || []).length)
      }
    }

    fetchBadgeCount()
    return () => { isMounted = false }
  }, [isAdminRole, isSupervisor, profile?.id, location.pathname])

  const isActive = (path) => location.pathname === path

  const renderItem = (label, icon, path, comingNext = false, count = 0, badgeTitle = 'Items needing attention') => {
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
          <span className="review-count-badge" title={badgeTitle}>{count}</span>
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

  const getNavSections = () => {
    const sections = []

    // ── Overview (all roles) ──
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

    // ── Content ──
    const contentItems = []

    if (isAdminRole) {
      contentItems.push({
        label: 'All Posts',
        icon: <FileText size={20} className="sidebar-icon" />,
        path: '/dashboard/posts',
        comingNext: false
      })
    } else if (isSupervisor) {
      contentItems.push({
        label: 'Team Posts',
        icon: <Briefcase size={20} className="sidebar-icon" />,
        path: '/dashboard/team-posts',
        comingNext: false
      })
    } else {
      // Contributor
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

    if (isAdminRole) {
      contentItems.push({
        label: 'Review Queue',
        icon: <ClipboardList size={20} className="sidebar-icon" />,
        path: '/dashboard/review',
        comingNext: false,
        count: reviewCount,
        badgeTitle: 'Posts awaiting review'
      })
      contentItems.push({
        label: 'Categories',
        icon: <FolderKanban size={20} className="sidebar-icon" />,
        path: '/dashboard/categories',
        comingNext: false
      })
      contentItems.push({
        label: 'Media Library',
        icon: <Image size={20} className="sidebar-icon" />,
        path: '/dashboard/media',
        comingNext: false
      })
    } else if (isSupervisor) {
      contentItems.push({
        label: 'Review Queue',
        icon: <ClipboardList size={20} className="sidebar-icon" />,
        path: '/dashboard/review',
        comingNext: false,
        count: reviewCount,
        badgeTitle: 'Submissions awaiting your review'
      })
    } else {
      // Contributor
      contentItems.push({
        label: 'Review Feedback',
        icon: <ClipboardList size={20} className="sidebar-icon" />,
        path: '/dashboard/review',
        comingNext: false,
        count: reviewCount,
        badgeTitle: 'Drafts with requested changes'
      })
    }

    // Trash Navigation Item (all authenticated roles)
    contentItems.push({
      label: 'Trash',
      icon: <Trash2 size={20} className="sidebar-icon" />,
      path: '/dashboard/posts/trash',
      comingNext: false
    })

    sections.push({ label: 'Content', items: contentItems })

    // ── Administration (Admin + Super Admin only) ──
    const adminItems = []
    if (userRole === 'super_admin') {
      adminItems.push({
        label: 'Users',
        icon: <Users size={20} className="sidebar-icon" />,
        path: '/dashboard/users',
        comingNext: false  // ← now live
      })
    }
    if (isAdminRole || isSupervisor) {
      adminItems.push({
        label: 'Activity Log',
        icon: <History size={20} className="sidebar-icon" />,
        path: '/dashboard/activity',
        comingNext: false
      })
    }
    if (adminItems.length > 0) {
      sections.push({ label: 'Administration', items: adminItems })
    }

    // ── Settings (all roles) ──
    sections.push({
      label: 'Settings',
      items: [
        {
          label: 'Profile',
          icon: <User size={20} className="sidebar-icon" />,
          path: '/dashboard/profile',
          comingNext: false
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

        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <button
          className="sidebar-collapse-btn mobile-only-close"
          onClick={onCloseMobile}
          aria-label="Close menu"
          style={{ display: 'none' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav-container">
        {getNavSections().map(section => (
          <div key={section.label} className="sidebar-group">
            <span className="sidebar-group-label">{section.label}</span>
            <div className="sidebar-group-links">
              {section.items.map(item =>
                renderItem(item.label, item.icon, item.path, item.comingNext, item.count || 0, item.badgeTitle)
              )}
            </div>
          </div>
        ))}
      </nav>

      {isCollapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-collapsed-avatar">
            {profile?.full_name ? profile.full_name.charAt(0).toUpperCase()
             : profile?.email ? profile.email.charAt(0).toUpperCase()
             : 'A'}
          </div>
        </div>
      )}
    </aside>
  )
}
