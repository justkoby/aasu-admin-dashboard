import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { MessageSquareText, Send, AlertCircle } from 'lucide-react'

/**
 * Review notes panel backed by public.review_notes.
 * - Administrators can read the note history and append new notes.
 * - Contributors see a read-only history (RLS limits rows to their posts).
 */
export default function ReviewNotes({ postId, userId, isAdmin }) {
  const [notes, setNotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Composer state (admin only)
  const [noteText, setNoteText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [composerError, setComposerError] = useState(null)

  const loadNotes = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Prefer joining the note author profile via the explicit FK alias
      let result = await supabase
        .from('review_notes')
        .select('*, author:profiles!review_notes_author_id_fkey(full_name, email)')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })

      // Fallback without the join if the relation cannot be resolved
      if (result.error) {
        console.warn('Review notes join failed, running fallback query:', result.error)
        result = await supabase
          .from('review_notes')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: false })
      }

      if (result.error) throw result.error
      setNotes(result.data || [])
    } catch (err) {
      console.error('Error loading review notes:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [postId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleSubmitNote = async (e) => {
    e.preventDefault()
    const trimmed = noteText.trim()
    if (!trimmed) {
      setComposerError('Please write a review note before submitting.')
      return
    }

    setIsSubmitting(true)
    setComposerError(null)
    try {
      const { error: insertErr } = await supabase.from('review_notes').insert({
        post_id: postId,
        author_id: userId,
        note: trimmed
      })
      if (insertErr) throw insertErr

      setNoteText('')
      await loadNotes()
    } catch (err) {
      console.error('Error saving review note:', err)
      const isPermission =
        err.code === '42501' ||
        err.message?.toLowerCase().includes('row-level security') ||
        err.message?.toLowerCase().includes('permission')
      setComposerError(
        isPermission
          ? 'You do not have permission to add review notes to this post.'
          : 'Failed to save the review note. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return 'N/A'
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return 'N/A'
    }
  }

  const resolveNoteAuthor = (note) => {
    if (note.author?.full_name) return note.author.full_name
    if (note.author?.email) return note.author.email
    return 'Administrator'
  }

  return (
    <div className="review-notes-panel">
      {/* Notes history list */}
      {isLoading ? (
        <div className="review-notes-loading">
          <div className="skeleton skeleton-text" style={{ width: '60%', height: '14px', marginBottom: '10px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '40px', marginBottom: '10px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '40px' }}></div>
        </div>
      ) : error ? (
        <div className="review-notes-error">
          <AlertCircle size={14} />
          <span>Review notes could not be loaded for this post.</span>
        </div>
      ) : notes.length === 0 ? (
        <div className="review-notes-empty">
          <MessageSquareText size={28} />
          <p>No review notes yet for this post.</p>
        </div>
      ) : (
        <div className="review-notes-list">
          {notes.map((note) => (
            <div className="review-note-item" key={note.id}>
              <div className="review-note-header">
                <span className="review-note-author">{resolveNoteAuthor(note)}</span>
                <span className="review-note-date">{formatDate(note.created_at)}</span>
              </div>
              <p className="review-note-text">{note.note}</p>
            </div>
          ))}
        </div>
      )}

      {/* Admin note composer */}
      {isAdmin && (
        <form className="review-note-composer" onSubmit={handleSubmitNote}>
          <label htmlFor="review-note-input">Add Review Note</label>
          <textarea
            id="review-note-input"
            rows="3"
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value)
              if (composerError) setComposerError(null)
            }}
            placeholder="Leave editorial feedback for the author..."
            disabled={isSubmitting}
            className={composerError ? 'has-error' : ''}
          ></textarea>
          {composerError && (
            <span className="validation-error-text">{composerError}</span>
          )}
          <button
            type="submit"
            className="editor-btn review-note-submit"
            disabled={isSubmitting}
          >
            <Send size={14} />
            <span>{isSubmitting ? 'Saving Note...' : 'Add Note'}</span>
          </button>
        </form>
      )}
    </div>
  )
}
