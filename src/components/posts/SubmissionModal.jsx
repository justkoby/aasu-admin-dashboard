import React from 'react'
import { FileCheck, X, AlertTriangle, CheckCircle2 } from 'lucide-react'

export const MAX_SUBMISSION_NOTE_LENGTH = 1000

/**
 * Professional confirmation dialog shown when a contributor submits or
 * resubmits a post for review. The "Note to Reviewer" textarea is optional;
 * when provided, the note is stored as a contributor_note review note.
 * Failed submissions keep the modal open (typed note preserved) and surface
 * the failure via the in-modal `notice` banner.
 */
export default function SubmissionModal({
  note,
  onNoteChange,
  onCancel,
  onConfirm,
  isSubmitting,
  notice
}) {
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

        {/* In-modal status notice (submission failures, partial successes) */}
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
          Your post will be sent to the editorial team for review. You can
          optionally include a note with context for your reviewer.
        </p>

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
            placeholder="Optional"
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
            disabled={isSubmitting}
          >
            <FileCheck size={16} />
            <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
