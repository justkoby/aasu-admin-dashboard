import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MoreVertical, Edit, Eye, Trash2 } from 'lucide-react'

/**
 * Helper to check if a user role can trash a post based on role and post state.
 */
export function canTrashPost(role, userId, post, teamAuthorIds = []) {
  if (!role || !post) return false
  const userRole = role.toLowerCase()
  const postStatus = (post.status || 'draft').toLowerCase()

  if (userRole === 'super_admin' || userRole === 'communications_admin') {
    return true
  }

  if (userRole === 'supervisor') {
    // Supervisor can trash own posts or assigned team posts
    const isOwn = post.author_id === userId
    const isTeam = teamAuthorIds.includes(post.author_id) || post.assigned_reviewer_id === userId
    return isOwn || isTeam
  }

  if (userRole === 'contributor') {
    // Contributor can trash only their own draft or returned-for-changes posts
    const isOwn = post.author_id === userId
    const isEditableState = ['draft', 'revision_requested', 'rejected', 'returned'].includes(postStatus)
    return isOwn && isEditableState
  }

  return false
}

export default function PostActionsMenu({
  post,
  userRole,
  userId,
  teamAuthorIds = [],
  onMoveToTrash,
  onViewPreview
}) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  const isContributor = userRole === 'contributor'
  const isLockedForContributor = isContributor && (post.status || '').toLowerCase() === 'in_review'
  const canTrash = canTrashPost(userRole, userId, post, teamAuthorIds)

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="post-actions-dropdown-container" ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="post-actions-trigger-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Actions for "${post.title || 'Untitled'}"`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          background: 'none',
          border: '1px solid var(--dash-border, #E2E8F0)',
          borderRadius: '6px',
          padding: '6px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--dash-text-secondary, #64748B)'
        }}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && (
        <div
          className="post-actions-menu"
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 100,
            minWidth: '160px',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--dash-border, #E2E8F0)',
            padding: '4px 0',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* 1. Edit Action */}
          {!isLockedForContributor ? (
            <Link
              to={`/dashboard/posts/${post.id}/edit`}
              className="post-actions-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--dash-navy, #0F172A)',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              <Edit size={14} />
              <span>Edit</span>
            </Link>
          ) : (
            <span
              className="post-actions-item disabled"
              role="menuitem"
              title="Editing is locked while awaiting review"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                fontSize: '13px',
                color: '#94A3B8',
                cursor: 'not-allowed'
              }}
            >
              <Edit size={14} />
              <span>Edit (Locked)</span>
            </span>
          )}

          {/* 2. View Preview Action */}
          <button
            type="button"
            className="post-actions-item"
            role="menuitem"
            onClick={() => {
              setIsOpen(false)
              if (onViewPreview) {
                onViewPreview(post)
              } else {
                // Fallback: window open preview link if available
                window.open(`/posts/${post.slug || post.id}`, '_blank')
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--dash-navy, #0F172A)',
              background: 'none',
              border: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer'
            }}
          >
            <Eye size={14} />
            <span>View</span>
          </button>

          {/* 3. Move to Trash Action */}
          {canTrash && (
            <>
              <div style={{ height: '1px', backgroundColor: 'var(--dash-border, #E2E8F0)', margin: '4px 0' }} />
              <button
                type="button"
                className="post-actions-item danger"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false)
                  if (onMoveToTrash) onMoveToTrash(post)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--aasu-error-red, #DC2626)',
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={14} />
                <span>Move to Trash</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
