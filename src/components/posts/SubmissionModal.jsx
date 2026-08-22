import React from 'react'
import { FileCheck, X, AlertTriangle, CheckCircle2, UserCheck } from 'lucide-react'

export const MAX_SUBMISSION_NOTE_LENGTH = 1000

/**
 * Professional confirmation dialog shown when a contributor submits or
 * resubmits a post for review.
 *
 * Props:
 *  note / onNoteChange  — Optional note to reviewer
 *  supervisors          — Array of { id, full_name, email } active supervisors
 *  selectedSupervisorId — Currently selected supervisor UUID
 *  onSupervisorChange   — (id: string) => void
 *  isLoadingSupervisors — bool: show skeleton while fetching
 *  onCancel / onConfirm / isSubmitting / notice — standard modal controls
 */
export default function SubmissionModal({
  note,
  onNoteChange,
  supervisors = [],
  selectedSupervisorId = '',
  onSupervisorChange,
  isLoadingSupervisors = false,
  onCancel,
  onConfirm,
  isSubmitting,
  notice
}) {
  const hasSupervisors = supervisors.length > 0
  const singleSupervisor = supervisors.length === 1 ? supervisors[0] : null
  const resolveSupName = (s) => s?.full_name || s?.email || 'Unknown'

  // Selected supervisor display
  const selectedSup = supervisors.find(s => s.id === selectedSupervisorId) || null

  // Only block confirm if supervisors array was loaded and none were found
  const noSupervisorAvailable = !isLoadingSupervisors && supervisors.length === 0
  const missingSelection = !isLoadingSupervisors && supervisors.length > 1 && !selectedSupervisorId
  const confirmDisabled = isSubmitting || noSupervisorAvailable || missingSelection || isLoadingSupervisors

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-modal-title"
    >
      <div className="submission-modal">
        <div className="submission-modal-header">
          <h2 id="submission-modal-title">Submit for Review</h2>
          <button
            type="button"
            className="submission-modal-close"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close submission dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* In-modal status notice */}
        {notice?.message && (
          <div className={`editor-notification-banner ${notice.type}`} style={{ marginBottom: '16px' }}>
            {notice.type === 'error' || notice.type === 'warning' ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>{notice.message}</span>
          </div>
        )}

        <p className="submission-modal-intro">
          Your post will be sent to your supervisor for review. You can
          optionally include a note with context for your reviewer.
        </p>

        {/* ── Supervisor Selection ── */}
        {isLoadingSupervisors ? (
          <div className="editor-form-group">
            <div className="skeleton skeleton-text" style={{ height: '16px', width: '40%', marginBottom: '8px' }} />
            <div className="skeleton skeleton-text" style={{ height: '38px', width: '100%' }} />
          </div>
        ) : noSupervisorAvailable ? (
          <div className="editor-notification-banner error" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={18} />
            <span>
              No supervisor has been assigned to your account. Please contact an administrator before submitting.
            </span>
          </div>
        ) : singleSupervisor ? (
          /* Single supervisor — preselected, display only */
          <div className="editor-form-group">
            <label>Submitting To</label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'var(--posts-input-bg)',
              border: '1px solid var(--posts-border)',
              borderRadius: 'var(--posts-radius)',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--posts-text-primary)'
            }}>
              <UserCheck size={16} style={{ color: 'var(--posts-red)', flexShrink: 0 }} />
              <span>{resolveSupName(singleSupervisor)}</span>
            </div>
          </div>
        ) : (
          /* Multiple supervisors — required dropdown */
          <div className="editor-form-group">
            <label htmlFor="submission-supervisor">
              Submit To Supervisor <span style={{ color: 'var(--aasu-error-red)' }}>*</span>
            </label>
            <select
              id="submission-supervisor"
              value={selectedSupervisorId}
              onChange={e => onSupervisorChange && onSupervisorChange(e.target.value)}
              disabled={isSubmitting}
              style={{ width: '100%' }}
            >
              <option value="">Select a supervisor...</option>
              {supervisors.map(s => (
                <option key={s.id} value={s.id}>{resolveSupName(s)}</option>
              ))}
            </select>
            {missingSelection && (
              <span className="validation-error-text">Please select a supervisor before submitting.</span>
            )}
          </div>
        )}

        {/* ── Optional Note to Reviewer ── */}
        {!noSupervisorAvailable && (
          <div className="editor-form-group">
            <label htmlFor="submission-note">Note to Reviewer</label>
            <textarea
              id="submission-note"
              rows="4"
              maxLength={MAX_SUBMISSION_NOTE_LENGTH}
              value={note}
              onChange={(e) =>
                onNoteChange(e.target.value.slice(0, MAX_SUBMISSION_NOTE_LENGTH))
              }
              placeholder="Optional — add any context, questions or information that may help your reviewer."
              disabled={isSubmitting}
            ></textarea>
            <div className="submission-modal-meta">
              <span className="uploader-hint">
                Add any context, questions or information that may help your reviewer.
              </span>
              <span className="submission-modal-counter">
                {note.length}/{MAX_SUBMISSION_NOTE_LENGTH}
              </span>
            </div>
          </div>
        )}

        <div className="submission-modal-actions">
          <button
            type="button"
            className="edit-action-btn"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            className="editor-btn submit-review"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            <FileCheck size={16} />
            <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
