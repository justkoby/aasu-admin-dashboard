import React from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { Edit } from 'lucide-react'

export default function PostsTable({ posts, isContributor = false, showAssignedReviewer = false }) {
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

  /**
   * Resolve the display name for a post author.
   * Data source: `author` object joined via posts_author_id_fkey.
   * Never exposes the raw UUID to dashboard users.
   */
  const resolveAuthor = (post) => {
    const a = post.author // aliased join result
    if (a?.full_name) return a.full_name
    if (a?.email)     return a.email
    return 'Unknown author'
  }

  /**
   * Resolve the assigned reviewer name from the joined profile.
   * Falls back gracefully if the join wasn't included.
   */
  const resolveAssignedReviewer = (post) => {
    const r = post.assigned_reviewer
    if (r?.full_name) return r.full_name
    if (r?.email)     return r.email
    if (!r && !post.assigned_reviewer_id) return '—'
    return '—'
  }

  const renderHeroBadge = (position) => {
    const pos = (position || 'none').toLowerCase()
    if (pos === 'primary') {
      return <span className="badge hero-yes">Primary</span>
    }
    if (pos === 'secondary') {
      return (
        <span
          className="badge hero-yes"
          style={{ backgroundColor: 'var(--dash-gold-light)', color: '#926E2D' }}
        >
          Secondary
        </span>
      )
    }
    return <span className="hero-none-label">None</span>
  }

  const formatType = (typeStr) => {
    if (!typeStr) return '-'
    return typeStr
      .split(/[_-]+|\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  // Contributors cannot open posts that are awaiting editorial review
  const isLocked = (post) =>
    isContributor && (post.status || '').toLowerCase() === 'in_review'

  return (
    <div className="posts-card-container">
      {/* 1. Desktop Table View */}
      <table className="posts-list-table" aria-label="CMS Posts List">
        <thead>
          <tr>
            <th scope="col" className="post-thumbnail-cell" style={{ width: '56px', minWidth: '56px' }}>Image</th>
            <th scope="col" style={{ minWidth: '220px' }}>Title</th>
            <th scope="col" style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>Type</th>
            <th scope="col" style={{ minWidth: '130px' }}>Author</th>
            <th scope="col" style={{ minWidth: '90px', whiteSpace: 'nowrap' }}>Status</th>
            {showAssignedReviewer && (
              <th scope="col" style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Reviewer</th>
            )}
            <th scope="col" style={{ minWidth: '96px', whiteSpace: 'nowrap' }}>Updated</th>
            <th scope="col" style={{ minWidth: '96px', whiteSpace: 'nowrap' }}>Published</th>
            <th scope="col" style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Hero</th>
            <th scope="col" style={{ width: '60px' }}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id}>
              <td className="post-thumbnail-cell">
                <img
                  src={post.featured_image_url || '/aasu-logo.png'}
                  alt={post.featured_image_alt || 'Post thumbnail'}
                  className="post-thumbnail"
                  onError={(e) => { e.target.src = '/aasu-logo.png' }}
                />
              </td>
              <td>
                {isLocked(post) ? (
                  <span className="post-title-cell-bold">{post.title || 'Untitled'}</span>
                ) : (
                  <Link to={`/dashboard/posts/${post.id}/edit`} className="post-title-cell-bold">
                    {post.title || 'Untitled'}
                  </Link>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatType(post.type)}</td>
              <td>{resolveAuthor(post)}</td>
              <td>
                <StatusBadge status={post.status} />
              </td>
              {showAssignedReviewer && (
                <td style={{ color: 'var(--dash-text-secondary)', fontSize: '13px' }}>
                  {resolveAssignedReviewer(post)}
                </td>
              )}
              <td>{formatDate(post.updated_at || post.created_at)}</td>
              <td>{formatDate(post.published_at)}</td>
              <td>{renderHeroBadge(post.hero_position)}</td>
              <td>
                {isLocked(post) ? (
                  <span
                    className="badge status-review"
                    title="Editing is locked while the post is awaiting review"
                  >
                    Locked
                  </span>
                ) : (
                  <Link to={`/dashboard/posts/${post.id}/edit`} className="edit-action-btn">
                    <Edit size={14} />
                    <span>Edit</span>
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 2. Mobile Responsive Grid View */}
      <div className="posts-mobile-grid">
        {posts.map((post) => (
          <div className="post-mobile-card" key={post.id}>
            <div className="post-mobile-header">
              <img
                src={post.featured_image_url || '/aasu-logo.png'}
                alt={post.featured_image_alt || 'Post thumbnail'}
                className="post-mobile-thumb"
                onError={(e) => { e.target.src = '/aasu-logo.png' }}
              />
              <div className="post-mobile-meta-title">
                <span className="post-mobile-type">{formatType(post.type)}</span>
                {isLocked(post) ? (
                  <span className="post-mobile-title">{post.title || 'Untitled'}</span>
                ) : (
                  <Link to={`/dashboard/posts/${post.id}/edit`} className="post-mobile-title">
                    {post.title || 'Untitled'}
                  </Link>
                )}
              </div>
            </div>

            <div className="post-mobile-details">
              <div className="mobile-detail-item">
                <span className="mobile-detail-label">Author</span>
                <span className="mobile-detail-value">{resolveAuthor(post)}</span>
              </div>
              <div className="mobile-detail-item">
                <span className="mobile-detail-label">Status</span>
                <span className="mobile-detail-value">
                  <StatusBadge status={post.status} />
                </span>
              </div>
              {showAssignedReviewer && (
                <div className="mobile-detail-item">
                  <span className="mobile-detail-label">Reviewer</span>
                  <span className="mobile-detail-value">{resolveAssignedReviewer(post)}</span>
                </div>
              )}
              <div className="mobile-detail-item">
                <span className="mobile-detail-label">Updated</span>
                <span className="mobile-detail-value">
                  {formatDate(post.updated_at || post.created_at)}
                </span>
              </div>
              <div className="mobile-detail-item">
                <span className="mobile-detail-label">Hero</span>
                <span className="mobile-detail-value">
                  {renderHeroBadge(post.hero_position)}
                </span>
              </div>
            </div>

            <div className="post-mobile-actions">
              {isLocked(post) ? (
                <span
                  className="badge status-review"
                  title="Editing is locked while the post is awaiting review"
                >
                  Locked
                </span>
              ) : (
                <Link to={`/dashboard/posts/${post.id}/edit`} className="edit-action-btn">
                  <Edit size={14} />
                  <span>Edit Post</span>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
