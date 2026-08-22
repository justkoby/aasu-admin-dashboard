import React, { useState, useEffect, useRef } from 'react'
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react'

export default function TrashConfirmModal({
  post,
  onConfirm,
  onCancel,
  isSubmitting = false,
  error = null
}) {
  const isPublished = (post?.status || '').toLowerCase() === 'published'
  const [confirmInput, setConfirmInput] = useState('')
  const inputRef = useRef(null)
  const modalRef = useRef(null)

  const isConfirmDisabled = isSubmitting || (isPublished && confirmInput.trim().toUpperCase() !== 'UNPUBLISH')

  // Keyboard trap & ESC listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    if (isPublished && inputRef.current) {
      inputRef.current.focus()
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, isSubmitting, isPublished])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isConfirmDisabled) return
    onConfirm(post)
  }

  if (!post) return null

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trash-modal-title"
    >
      <div
        ref={modalRef}
        className="modal-content-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--dash-border, #E2E8F0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Trash2 size={20} />
            </div>
            <h3 id="trash-modal-title" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dash-navy, #0F172A)', margin: 0 }}>
              Move to Trash
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--dash-text-secondary, #64748B)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <p style={{ fontSize: '15px', color: '#334155', lineHeight: 1.6, margin: '0 0 16px 0' }}>
            Move <strong>‘{post.title || 'Untitled'}’</strong> to Trash? It will be removed from the public website and can be restored later.
          </p>

          {isPublished && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#991B1B' }}>
                  This post is currently LIVE on the public website.
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#7F1D1D', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Trashing this post will immediately unpublish it. To confirm, type <strong>UNPUBLISH</strong> below:
              </p>
              <input
                ref={inputRef}
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type UNPUBLISH to confirm"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #F87171',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#7F1D1D',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#B91C1C'
              }}
            >
              {error.message || 'An error occurred while moving the post to trash.'}
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{
                padding: '9px 16px',
                borderRadius: '6px',
                border: '1px solid var(--dash-border, #CBD5E1)',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConfirmDisabled}
              style={{
                padding: '9px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isConfirmDisabled ? '#FCA5A5' : '#DC2626',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isConfirmDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>Trashing...</span>
                </>
              ) : (
                <span>Move to Trash</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
