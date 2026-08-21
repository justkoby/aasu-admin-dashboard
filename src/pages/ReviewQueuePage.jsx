import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import StatusBadge from '../components/posts/StatusBadge'
import {
  ClipboardList,
  RefreshCw,
  AlertTriangle,
  MessageSquareText,
  FileEdit,
  CheckCircle2,
  X
} from 'lucide-react'
import '../styles/posts.css'
import '../styles/review.css'

export default function ReviewQueuePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const location = useLocation()
  const isAdmin =
    profile?.role === 'super_admin' || profile?.role === 'communications_admin'

  // Success flash message passed back from review decisions
  const [flashMessage, setFlashMessage] = useState(location.state?.message || null)

  // Shared loading / error states
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Administrator queue states
  const [totalAwaiting, setTotalAwaiting] = useState(0)
  const [queuePosts, setQueuePosts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  // Contributor feedback states
  const [feedbackPosts, setFeedbackPosts] = useState([])

  // Clear the navigation state so a refresh does not replay the flash
  useEffect(() => {
    if (location.state?.message) {
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // ================================================================
  // ADMINISTRATOR: load the in_review queue
  // ================================================================
  const loadQueue = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Total awaiting review (unfiltered headline count)
      const { count: awaitingCount, error: totalErr } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_review')
      if (totalErr) throw totalErr
      setTotalAwaiting(awaitingCount || 0)

      // 2. Build filtered query helpers
      const applyFilters = (query) => {
        let q = query.eq('status', 'in_review')
        if (debouncedSearch) {
          q = q.ilike('title', `%${debouncedSearch}%`)
        }
        if (typeFilter) {
          q = q.eq('type', typeFilter)
        }
        return q
      }

      const orderColumn = 'submitted_at'
      const ascending = sortBy === 'oldest'

      // 3. Fetch with the explicit author FK join; fall back without join
      const runQuery = (withJoin) => {
        let q = supabase.from('posts')
        q = q.select(
          withJoin
            ? '*, author:profiles!posts_author_id_fkey(full_name, email)'
            : '*'
        )
        q = applyFilters(q)
        q = q.order(orderColumn, { ascending, nullsFirst: false })
        return q.limit(100)
      }

      let result = await runQuery(true)
      if (result.error) {
        console.warn('Review queue join failed, running fallback query:', result.error)
        result = await runQuery(false)
      }
      if (result.error) throw result.error

      setQueuePosts(result.data || [])
    } catch (err) {
      console.error('Error loading review queue:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ================================================================
  // CONTRIBUTOR: load own posts that carry review notes
  // ================================================================
  const loadFeedback = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Inner join keeps only posts that have at least one review note
      let result = await supabase
        .from('posts')
        .select('*, review_notes!inner(id, note, created_at)')
        .eq('author_id', user.id)
        .order('updated_at', { ascending: false })

      // Fallback: two-step query if the embed filter is unavailable
      if (result.error) {
        console.warn('Feedback inner join failed, running fallback query:', result.error)
        const { data: myPosts, error: postsErr } = await supabase
          .from('posts')
          .select('*')
          .eq('author_id', user.id)
          .order('updated_at', { ascending: false })
        if (postsErr) throw postsErr

        let notesByPost = {}
        const postIds = (myPosts || []).map((p) => p.id)
        if (postIds.length > 0) {
          const { data: notes, error: notesErr } = await supabase
            .from('review_notes')
            .select('id, post_id, note, created_at')
            .in('post_id', postIds)
          if (notesErr) throw notesErr
          for (const note of notes || []) {
            if (!notesByPost[note.post_id]) notesByPost[note.post_id] = []
            notesByPost[note.post_id].push(note)
          }
        }

        result = {
          data: (myPosts || [])
            .map((p) => ({ ...p, review_notes: notesByPost[p.id] || [] }))
            .filter((p) => p.review_notes.length > 0),
          error: null
        }
      }

      if (result.error) throw result.error
      setFeedbackPosts(result.data || [])
    } catch (err) {
      console.error('Error loading review feedback:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (isAdmin) {
      loadQueue()
    } else {
      loadFeedback()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin, debouncedSearch, typeFilter, sortBy])

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '-'
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (e) {
      return '-'
    }
  }

  const formatType = (typeStr) => {
    if (!typeStr) return '-'
    return typeStr
      .split(/[_-]+|\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const resolveAuthor = (post) => {
    if (post.author?.full_name) return post.author.full_name
    if (post.author?.email) return post.author.email
    return 'Unknown author'
  }

  const getLatestNote = (post) => {
    const notes = post.review_notes || []
    if (notes.length === 0) return null
    return [...notes].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0]
  }

  // Shared error screen
  if (error) {
    const isConnErr =
      error.message?.toLowerCase().includes('failed to fetch') ||
      error.message?.toLowerCase().includes('networkerror')
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--aasu-error-red)' }} />
        <h3>{isAdmin ? 'Failed to Load Review Queue' : 'Failed to Load Review Feedback'}</h3>
        <p>
          {isConnErr
            ? 'Connection failed. Please check your network connection and try again.'
            : 'An unexpected database error occurred while querying the AASU CMS.'}
        </p>
        <button
          className="retry-btn"
          onClick={() => (isAdmin ? loadQueue() : loadFeedback())}
        >
          <RefreshCw size={16} />
          <span>Retry Connection</span>
        </button>
      </div>
    )
  }

  // ================================================================
  // CONTRIBUTOR: Review Feedback view
  // ================================================================
  if (!isAdmin) {
    return (
      <div className="dashboard-content-wrapper">
        {/* Page Header */}
        <div className="review-page-header">
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
              Review Feedback
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
              Editorial feedback from administrators on your submitted posts.
            </p>
          </div>
        </div>

        {flashMessage && (
          <div className="editor-notification-banner success review-flash-banner">
            <CheckCircle2 size={18} />
            <span>{flashMessage}</span>
            <button
              type="button"
              className="review-flash-close"
              onClick={() => setFlashMessage(null)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="posts-card-container" style={{ padding: '24px' }}>
            <div className="skeleton skeleton-title" style={{ width: '40%', height: '24px', marginBottom: '20px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px' }}></div>
          </div>
        ) : feedbackPosts.length === 0 ? (
          <div className="posts-card-container">
            <div className="empty-state">
              <MessageSquareText size={48} className="empty-state-icon" />
              <h3>No review feedback yet</h3>
              <p>
                When an administrator reviews one of your submitted posts, their feedback will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="review-feedback-list">
            {feedbackPosts.map((post) => {
              const latestNote = getLatestNote(post)
              const status = (post.status || 'draft').toLowerCase()
              return (
                <div className="review-feedback-card" key={post.id}>
                  <div className="review-feedback-card-header">
                    <div className="review-feedback-title-row">
                      <Link to={`/dashboard/review/${post.id}`} className="post-title-cell-bold">
                        {post.title || 'Untitled'}
                      </Link>
                      <span className="review-feedback-type">{formatType(post.type)}</span>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>

                  {latestNote && (
                    <div className="review-feedback-latest">
                      <span className="review-feedback-latest-label">
                        Latest feedback · {formatDate(latestNote.created_at)}
                      </span>
                      <p className="review-feedback-note-text">{latestNote.note}</p>
                    </div>
                  )}

                  <div className="review-feedback-card-actions">
                    {status === 'draft' && (
                      <Link to={`/dashboard/posts/${post.id}/edit`} className="edit-action-btn">
                        <FileEdit size={14} />
                        <span>Edit Draft</span>
                      </Link>
                    )}
                    {status === 'in_review' && (
                      <span className="review-feedback-status-label awaiting">Awaiting Review</span>
                    )}
                    {status === 'published' && (
                      <span className="review-feedback-status-label approved">Published</span>
                    )}
                    <Link to={`/dashboard/review/${post.id}`} className="edit-action-btn">
                      <MessageSquareText size={14} />
                      <span>View Feedback</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ================================================================
  // ADMINISTRATOR: Review Queue view
  // ================================================================
  return (
    <div className="dashboard-content-wrapper">
      {/* Page Header */}
      <div className="review-page-header">
        <div style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
            Review Queue
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            {isLoading
              ? 'Loading submissions awaiting editorial review...'
              : `${totalAwaiting} ${totalAwaiting === 1 ? 'post is' : 'posts are'} awaiting review.`}
          </p>
        </div>
      </div>

      {/* Flash success banner after a review decision */}
      {flashMessage && (
        <div className="editor-notification-banner success review-flash-banner">
          <CheckCircle2 size={18} />
          <span>{flashMessage}</span>
          <button
            type="button"
            className="review-flash-close"
            onClick={() => setFlashMessage(null)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="posts-filter-bar">
        <div className="filter-group search">
          <label htmlFor="review-search">Search Submissions</label>
          <input
            id="review-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title..."
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="review-type">Content Type</label>
          <select
            id="review-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="news">News</option>
            <option value="blog">Blog</option>
            <option value="event">Event</option>
            <option value="readout">Readout</option>
            <option value="press_release">Press Release</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="review-sort">Sort By Submission</label>
          <select
            id="review-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Queue Table */}
      {isLoading ? (
        <div className="posts-card-container" style={{ padding: '24px' }}>
          <div className="skeleton skeleton-title" style={{ width: '40%', height: '24px', marginBottom: '20px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px' }}></div>
        </div>
      ) : queuePosts.length === 0 ? (
        <div className="posts-card-container">
          <div className="empty-state">
            <ClipboardList size={48} className="empty-state-icon" />
            <h3>No submissions awaiting review</h3>
            <p>
              {searchTerm || typeFilter
                ? 'No in-review posts match your search or filters. Clear them and try again.'
                : 'The review queue is clear. New contributor submissions will appear here.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="posts-card-container">
          {/* Desktop Table View */}
          <table className="posts-list-table" aria-label="Review Queue">
            <thead>
              <tr>
                <th scope="col" style={{ width: '56px', minWidth: '56px' }}>Image</th>
                <th scope="col" style={{ minWidth: '220px' }}>Title</th>
                <th scope="col" style={{ minWidth: '130px' }}>Author</th>
                <th scope="col" style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>Type</th>
                <th scope="col" style={{ minWidth: '96px', whiteSpace: 'nowrap' }}>Submitted</th>
                <th scope="col" style={{ minWidth: '96px', whiteSpace: 'nowrap' }}>Updated</th>
                <th scope="col" style={{ width: '110px' }}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {queuePosts.map((post) => (
                <tr key={post.id}>
                  <td className="post-thumbnail-cell">
                    <img
                      src={post.featured_image_url || '/aasu-logo.png'}
                      alt={post.featured_image_alt || 'Post thumbnail'}
                      className="post-thumbnail"
                      onError={(e) => {
                        e.target.src = '/aasu-logo.png'
                      }}
                    />
                  </td>
                  <td>
                    <Link to={`/dashboard/review/${post.id}`} className="post-title-cell-bold">
                      {post.title || 'Untitled'}
                    </Link>
                  </td>
                  <td>{resolveAuthor(post)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatType(post.type)}</td>
                  <td>{formatDate(post.submitted_at)}</td>
                  <td>{formatDate(post.updated_at || post.created_at)}</td>
                  <td>
                    <Link to={`/dashboard/review/${post.id}`} className="review-open-btn">
                      <ClipboardList size={14} />
                      <span>Review</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile Responsive Card View */}
          <div className="posts-mobile-grid">
            {queuePosts.map((post) => (
              <div className="post-mobile-card" key={post.id}>
                <div className="post-mobile-header">
                  <img
                    src={post.featured_image_url || '/aasu-logo.png'}
                    alt={post.featured_image_alt || 'Post thumbnail'}
                    className="post-mobile-thumb"
                    onError={(e) => {
                      e.target.src = '/aasu-logo.png'
                    }}
                  />
                  <div className="post-mobile-meta-title">
                    <span className="post-mobile-type">{formatType(post.type)}</span>
                    <Link to={`/dashboard/review/${post.id}`} className="post-mobile-title">
                      {post.title || 'Untitled'}
                    </Link>
                  </div>
                </div>

                <div className="post-mobile-details">
                  <div className="mobile-detail-item">
                    <span className="mobile-detail-label">Author</span>
                    <span className="mobile-detail-value">{resolveAuthor(post)}</span>
                  </div>
                  <div className="mobile-detail-item">
                    <span className="mobile-detail-label">Submitted</span>
                    <span className="mobile-detail-value">{formatDate(post.submitted_at)}</span>
                  </div>
                  <div className="mobile-detail-item">
                    <span className="mobile-detail-label">Updated</span>
                    <span className="mobile-detail-value">
                      {formatDate(post.updated_at || post.created_at)}
                    </span>
                  </div>
                </div>

                <div className="post-mobile-actions">
                  <Link to={`/dashboard/review/${post.id}`} className="review-open-btn">
                    <ClipboardList size={14} />
                    <span>Review Post</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
