import React, { useState, useEffect, useRef } from 'react'
import { AlertOctagon, X, Loader2, Info } from 'lucide-react'

export default function PermanentDeleteModal({
  post,
  onConfirm,
  onCancel,
  isSubmitting = false,
  isReferencedByProtectedResource = false,
  protectedResourceMessage = '',
  error = null
}) {
  const [confirmInput, setConfirmInput] = useState('')
  const inputRef = useRef(null)

  const isConfirmDisabled =
    isSubmitting ||
    isReferencedByProtectedResource ||
    confirmInput.trim().toUpperCase() !== 'DELETE'

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    if (inputRef.current && !isReferencedByProtectedResource) {
      inputRef.current.focus()
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, isSubmitting, isReferencedByProtectedResource])

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
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-delete-modal-title"
    >
      <div
        className="modal-content-card"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
            alignItems: 'center',
            backgroundColor: '#FEF2F2'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#991B1B',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertOctagon size={20} />
            </div>
            <div>
              <h3 id="perm-delete-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                Permanently Delete Post
              </h3>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#B91C1C' }}>
                Super Admin Authorization Required
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: '#991B1B',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <p style={{ fontSize: '15px', color: '#1E293B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            Are you sure you want to permanently delete <strong>‘{post.title || 'Untitled'}’</strong>?
          </p>

          <div
            style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FCD34D',
              borderRadius: '8px',
              padding: '14px 16px',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
              <Info size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>
                Permanent Action Details:
              </span>
            </div>
            <ul style={{ margin: '0', paddingLeft: '24px', fontSize: '13px', color: '#78350F', lineHeight: 1.5 }}>
              <li>Post categories, gallery relations, and review notes will be permanently removed.</li>
              <li><strong>Media Library assets and Storage objects will be preserved safely.</strong></li>
              <li>This action <strong>cannot be undone</strong>.</li>
            </ul>
          </div>

          {isReferencedByProtectedResource ? (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                color: '#991B1B',
                marginBottom: '16px'
              }}
            >
              <strong>Deletion Unavailable:</strong> {protectedResourceMessage || 'This post is currently referenced by another protected system resource and cannot be deleted.'}
            </div>
          ) : (
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="perm-delete-input"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}
              >
                To confirm, type <span style={{ color: '#DC2626', fontFamily: 'monospace' }}>DELETE</span> below:
              </label>
              <input
                id="perm-delete-input"
                ref={inputRef}
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type DELETE to confirm"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0F172A',
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
              {error.message || 'An error occurred during permanent deletion.'}
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
                backgroundColor: isConfirmDisabled ? '#94A3B8' : '#7F1D1D',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 700,
                cursor: isConfirmDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>Deleting Permanently...</span>
                </>
              ) : (
                <span>Permanently Delete</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
