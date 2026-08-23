import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
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
    const isOwn = post.author_id === userId
    const isTeam = teamAuthorIds.includes(post.author_id) || post.assigned_reviewer_id === userId
    return isOwn || isTeam
  }

  if (userRole === 'contributor') {
    const isOwn = post.author_id === userId
    const isEditableState = ['draft', 'revision_requested', 'rejected', 'returned'].includes(postStatus)
    return isOwn && isEditableState
  }

  return false
}

const MENU_MIN_WIDTH = 168
const MENU_ESTIMATED_HEIGHT = 120
const MENU_GAP = 4
const VIEWPORT_MARGIN = 8

function computeMenuPosition(triggerRect) {
  const vh = window.innerHeight
  const vw = window.innerWidth

  const spaceBelow = vh - triggerRect.bottom - VIEWPORT_MARGIN
  const spaceAbove = triggerRect.top - VIEWPORT_MARGIN
  const opensUpward = spaceBelow < MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow

  const top = opensUpward
    ? triggerRect.top - MENU_ESTIMATED_HEIGHT - MENU_GAP
    : triggerRect.bottom + MENU_GAP

  let left = triggerRect.right - MENU_MIN_WIDTH
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - MENU_MIN_WIDTH - VIEWPORT_MARGIN))

  return { top, left }
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
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const location = useLocation()

  const isContributor = userRole === 'contributor'
  const isLockedForContributor = isContributor && (post.status || '').toLowerCase() === 'in_review'
  const canTrash = canTrashPost(userRole, userId, post, teamAuthorIds)

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos(computeMenuPosition(rect))
    setIsOpen(true)
  }, [])

  const closeMenu = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        closeMenu()
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu()
    }

    const handleScroll = () => closeMenu()
    const handleResize = () => closeMenu()

    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, closeMenu])

  useEffect(() => {
    closeMenu()
  }, [location.pathname, closeMenu])

  const menuPortal = isOpen
    ? createPortal(
        <div
          ref={menuRef}
          className="post-actions-menu"
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 9999,
            minWidth: MENU_MIN_WIDTH,
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -3px rgba(0,0,0,0.12), 0 4px 10px -2px rgba(0,0,0,0.07)',
            border: '1px solid var(--dash-border, #E2E8F0)',
            padding: '4px 0',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {!isLockedForContributor ? (
            <Link
              to={`/dashboard/posts/${post.id}/edit`}
              className="post-actions-item"
              role="menuitem"
              onClick={closeMenu}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', fontSize: '13px', fontWeight: 500,
                color: 'var(--dash-navy, #0F172A)', textDecoration: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              <Edit size={14} /><span>Edit</span>
            </Link>
          ) : (
            <span
              className="post-actions-item disabled"
              role="menuitem"
              title="Editing is locked while awaiting review"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', fontSize: '13px',
                color: '#94A3B8', cursor: 'not-allowed', whiteSpace: 'nowrap'
              }}
            >
              <Edit size={14} /><span>Edit (Locked)</span>
            </span>
          )}

          <button
            type="button"
            className="post-actions-item"
            role="menuitem"
            onClick={() => {
              closeMenu()
              if (onViewPreview) {
                onViewPreview(post)
              } else {
                window.open(`/posts/${post.slug || post.id}`, '_blank')
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              color: 'var(--dash-navy, #0F172A)', background: 'none', border: 'none',
              width: '100%', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            <Eye size={14} /><span>View</span>
          </button>

          {canTrash && (
            <>
              <div style={{ height: '1px', backgroundColor: 'var(--dash-border, #E2E8F0)', margin: '4px 0' }} />
              <button
                type="button"
                className="post-actions-item danger"
                role="menuitem"
                onClick={() => {
                  closeMenu()
                  if (onMoveToTrash) onMoveToTrash(post)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', fontSize: '13px', fontWeight: 600,
                  color: 'var(--aasu-error-red, #DC2626)', background: 'none', border: 'none',
                  width: '100%', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                <Trash2 size={14} /><span>Move to Trash</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="post-actions-trigger-btn"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
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
      {menuPortal}
    </>
  )
}
