import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react'

/**
 * Administrator review decision controls (rendered only for admin roles).
 * - Publish: approves the post with confirmation.
 * - Return for changes: requires a mandatory feedback note, records it in
 *   public.review_notes and sends the post back to draft.
 */
export default function ReviewActions({ post, adminId }) {
  const navigate = useNavigate()
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackError, setFeedbackError] = useState(null)

  const getFriendlyError = (err) => {
    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
      return 'Network error. Please check your internet connection and try again.'
    }
    if (err.code === '42501' || msg.includes('row-level security') || msg.includes('permission')) {
      return 'You do not have permission to perform this review action.'
    }
    return 'The review action could not be completed. Please try again.'
  }

  // PUBLISH — approve the submitted content
  const handlePublish = async () => {
    const confirm = window.confirm(
      'Approve and publish this post? It will become visible on the public website immediately.'
    )
    if (!confirm) return

    setIsBusy(true)
    setActionError(null)
    try {
      const now = new Date().toISOString()
      const payload = {
        status: 'published',
        reviewed_by: adminId,
        reviewed_at: now
      }
      // Keep the existing publication date when the post was already published before
      if (!post.published_at) {
        payload.published_at = now
      }
      // hero_position is intentionally untouched so the selected placement is preserved

      const { error: updateErr } = await supabase
        .from('posts')
        .update(payload)
        .eq('id', post.id)

      if (updateErr) throw updateErr

      navigate('/dashboard/review', {
        state: { message: `"${post.title || 'The post'}" has been approved and published.` }
      })
    } catch (err) {
      console.error('Publish action failed:', err)
      setActionError(getFriendlyError(err))
      setIsBusy(false)
    }
  }

  // RETURN FOR CHANGES — mandatory feedback note, then back to draft
  const handleReturnForChanges = async () => {
    const trimmed = feedbackNote.trim()
    if (!trimmed) {
      setFeedbackError('A feedback note is required before returning a post for changes.')
      return
    }

    setIsBusy(true)
    setActionError(null)
    setFeedbackError(null)
    try {
      const now = new Date().toISOString()

      // 1. Record the administrator feedback note
      const { error: noteErr } = await supabase.from('review_notes').insert({
        post_id: post.id,
        author_id: adminId,
        note: trimmed
      })
      if (noteErr) throw noteErr

      // 2. Move the post back to draft and clear any hero placement request
      const { error: updateErr } = await supabase
        .from('posts')
        .update({
          status: 'draft',
          reviewed_by: adminId,
          reviewed_at: now,
          hero_position: 'none',
          // Preserve the original publication date only if it had been published before
          published_at: post.published_at || null
        })
        .eq('id', post.id)

      if (updateErr) throw updateErr

      navigate('/dashboard/review', {
        state: { message: `"${post.title || 'The post'}" was returned to draft with your feedback attached.` }
      })
    } catch (err) {
      console.error('Return for changes failed:', err)
      setActionError(getFriendlyError(err))
      setIsBusy(false)
    }
  }

  return (
    <div className="review-actions-panel">
      {/* Error banner */}
      {actionError && (
        <div className="editor-notification-banner error" style={{ marginBottom: '16px' }}>
          <AlertTriangle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Required feedback note for returning content */}
      <div className="editor-form-group">
        <label htmlFor="return-feedback-note">Feedback for Author (Required to return)</label>
        <textarea
          id="return-feedback-note"
          rows="4"
          value={feedbackNote}
          onChange={(e) => {
            setFeedbackNote(e.target.value)
            if (feedbackError) setFeedbackError(null)
          }}
          placeholder="Explain what needs to change before this post can be approved..."
          disabled={isBusy}
          className={feedbackError ? 'has-error' : ''}
        ></textarea>
        {feedbackError && (
          <span className="validation-error-text">{feedbackError}</span>
        )}
      </div>

      {/* Decision buttons */}
      <div className="review-actions-buttons">
        <button
          type="button"
          className="editor-btn review-return-btn"
          onClick={handleReturnForChanges}
          disabled={isBusy}
        >
          <RotateCcw size={16} />
          <span>{isBusy ? 'Processing...' : 'Return for Changes'}</span>
        </button>

        <button
          type="button"
          className="editor-btn publish"
          onClick={handlePublish}
          disabled={isBusy}
        >
          <CheckCircle2 size={16} />
          <span>{isBusy ? 'Processing...' : 'Approve & Publish'}</span>
        </button>
      </div>
    </div>
  )
}
