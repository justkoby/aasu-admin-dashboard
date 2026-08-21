import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import StatusBadge from '../components/posts/StatusBadge'
import ReviewNotes from '../components/review/ReviewNotes'
import ReviewActions from '../components/review/ReviewActions'
import {
  ArrowLeft,
  FileEdit,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  MessageSquareText
} from 'lucide-react'
import '../styles/posts.css'
import '../styles/review.css'

export default function ReviewPostPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  const isAdmin =
    profile?.role === 'super_admin' || profile?.role === 'communications_admin'

  const [post, setPost] = useState(null)
  const [categoryNames, setCategoryNames] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  useEffect(() => {
    if (authLoading) return
    let isMounted = true

    const loadReviewPost = async () => {
      setIsLoading(true)
      setError(null)
      setPermissionDenied(false)
      try {
        // 1. Fetch post with the explicit author FK join (fallback without join)
        let result = await supabase
          .from('posts')
          .select('*, author:profiles!posts_author_id_fkey(full_name, email)')
          .eq('id', id)
          .single()

        if (result.error) {
          console.warn('Review post join failed, running fallback query:', result.error)
          result = await supabase
            .from('posts')
            .select('*')
            .eq('id', id)
            .single()
        }
        if (result.error) throw result.error

        const loadedPost = result.data

        // 2. Contributors may only review content attached to their own posts
        if (!isAdmin && loadedPost.author_id !== user.id) {
          setPermissionDenied(true)
          setIsLoading(false)
          return
        }

        if (isMounted) {
          setPost(loadedPost)
        }

        // 3. Resolve category names for the post
        try {
          const { data: connections, error: connErr } = await supabase
            .from('post_categories')
            .select('category_id')
            .eq('post_id', id)
          if (connErr) throw connErr

          const catIds = (connections || []).map((c) => c.category_id)
          if (catIds.length > 0) {
            const { data: cats, error: catsErr } = await supabase
              .from('categories')
              .select('id, name')
              .in('id', catIds)
            if (catsErr) throw catsErr
            if (isMounted) {
              setCategoryNames((cats || []).map((c) => c.name))
            }
          }
        } catch (catErr) {
          // Category metadata is decorative in the preview — never block on it
          console.warn('Could not load categories for review preview:', catErr)
        }
      } catch (err) {
        console.error('Error loading review post:', err)
        if (isMounted) {
          setError(err)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadReviewPost()
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authLoading])

  // Sanitize the rich article content exactly once per loaded post
  const safeContent = useMemo(() => sanitizeHtml(post?.content || ''), [post?.content])

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

  const formatHero = (position) => {
    const pos = (position || 'none').toLowerCase()
    if (pos === 'primary') return 'Primary Hero'
    if (pos === 'secondary') return 'Secondary Hero'
    return 'None'
  }

  const resolveAuthor = () => {
    if (post.author?.full_name) return post.author.full_name
    if (post.author?.email) return post.author.email
    return 'Unknown author'
  }

  const handleRetry = () => {
    // Trigger a reload by clearing and re-running the effect dependencies
    setError(null)
    setIsLoading(true)
    const reload = async () => {
      try {
        const { data, error: retryErr } = await supabase
          .from('posts')
          .select('*')
          .eq('id', id)
          .single()
        if (retryErr) throw retryErr
        if (!isAdmin && data.author_id !== user.id) {
          setPermissionDenied(true)
        } else {
          setPost(data)
        }
      } catch (err) {
        setError(err)
      } finally {
        setIsLoading(false)
      }
    }
    reload()
  }

  // ---------------- Loading ----------------
  if (authLoading || isLoading) {
    return (
      <div className="auth-loader-container">
        <div className="auth-loader"></div>
        <p>Loading Review...</p>
      </div>
    )
  }

  // ---------------- Permission denied (e.g. contributor opening another author's post) ----------------
  if (permissionDenied) {
    return (
      <div className="dashboard-content-wrapper">
        <div className="error-state">
          <ShieldAlert size={48} className="error-state-icon" style={{ color: 'var(--dash-gold)' }} />
          <h3>Access Restricted</h3>
          <p>
            You can only view review feedback attached to your own posts. If you believe this is a
            mistake, please contact the communications team.
          </p>
          <button className="retry-btn" onClick={() => navigate('/dashboard/review')}>
            <ArrowLeft size={16} />
            <span>Back to Review Feedback</span>
          </button>
        </div>
      </div>
    )
  }

  // ---------------- Not found / load error ----------------
  if (error || !post) {
    const isConnErr =
      error?.message?.toLowerCase().includes('failed to fetch') ||
      error?.message?.toLowerCase().includes('networkerror')
    return (
      <div className="dashboard-content-wrapper">
        <div className="error-state">
          <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--aasu-error-red)' }} />
          <h3>Unable to Load Post</h3>
          <p>
            {isConnErr
              ? 'Connection failed. Please check your network connection and try again.'
              : 'This post could not be loaded. It may have been removed, or you may not have permission to view it.'}
          </p>
          <button className="retry-btn" onClick={handleRetry}>
            <RefreshCw size={16} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    )
  }

  const contributorStatus = (post.status || 'draft').toLowerCase()

  return (
    <div className="dashboard-content-wrapper">
      {/* Page Header */}
      <div className="review-page-header">
        <div style={{ textAlign: 'left' }}>
          <button
            type="button"
            onClick={() => navigate('/dashboard/review')}
            className="edit-action-btn"
            style={{ marginBottom: '12px' }}
          >
            <ArrowLeft size={14} />
            <span>{isAdmin ? 'Back to Review Queue' : 'Back to Review Feedback'}</span>
          </button>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
            {isAdmin ? 'Review Submission' : 'Review Feedback'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            Read-only preview of "{post.title || 'Untitled'}"
          </p>
        </div>
        <div className="review-header-status">
          <StatusBadge status={post.status} />
        </div>
      </div>

      <div className="review-grid-layout">
        {/* ---------------- Left: Read-only preview ---------------- */}
        <div className="editor-main-panel">
          {/* Card: Featured Image */}
          <div className="editor-card">
            <h2>Featured Image</h2>
            {post.featured_image_url ? (
              <div className="review-featured-image-wrapper">
                <img
                  src={post.featured_image_url}
                  alt={post.featured_image_alt || 'Post featured image'}
                  className="review-featured-image"
                  onError={(e) => {
                    e.target.src = '/aasu-logo.png'
                  }}
                />
                <p className="review-alt-text-line">
                  <strong>Alt text:</strong> {post.featured_image_alt || 'Not provided'}
                </p>
              </div>
            ) : (
              <p className="uploader-hint">No featured image was attached to this submission.</p>
            )}
          </div>

          {/* Card: Article Preview */}
          <div className="editor-card">
            <h2>Article Preview</h2>
            <h1 className="review-preview-title">{post.title || 'Untitled'}</h1>
            {post.excerpt && (
              <p className="review-preview-excerpt">{post.excerpt}</p>
            )}
            <div
              className="article-preview-content"
              dangerouslySetInnerHTML={{ __html: safeContent }}
            />
          </div>

          {/* Card: Submission Metadata */}
          <div className="editor-card">
            <h2>Submission Details</h2>
            <div className="review-meta-grid">
              <div className="review-meta-item">
                <span className="review-meta-label">Post Type</span>
                <span className="review-meta-value">{formatType(post.type)}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Author</span>
                <span className="review-meta-value">{resolveAuthor()}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">URL Slug</span>
                <span className="review-meta-value review-slug-value">{post.slug || '-'}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Submitted</span>
                <span className="review-meta-value">{formatDate(post.submitted_at)}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Last Updated</span>
                <span className="review-meta-value">{formatDate(post.updated_at || post.created_at)}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Hero Placement Request</span>
                <span className="review-meta-value">{formatHero(post.hero_position)}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Regional Focus</span>
                <span className="review-meta-value">{post.region || 'None / Regional'}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Thematic Focus</span>
                <span className="review-meta-value">{post.theme || '-'}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">Categories</span>
                <span className="review-meta-value">
                  {categoryNames.length > 0 ? (
                    <span className="review-category-chips">
                      {categoryNames.map((name) => (
                        <span className="review-category-chip" key={name}>{name}</span>
                      ))}
                    </span>
                  ) : (
                    'Uncategorized'
                  )}
                </span>
              </div>
            </div>

            {/* SEO Metadata block */}
            <div className="review-seo-block">
              <div className="review-meta-item">
                <span className="review-meta-label">SEO Title</span>
                <span className="review-meta-value">{post.seo_title || `Fallback: ${post.title || 'title'}`}</span>
              </div>
              <div className="review-meta-item">
                <span className="review-meta-label">SEO Description</span>
                <span className="review-meta-value">{post.seo_description || 'Fallback: excerpt'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- Right: Review controls ---------------- */}
        <div className="editor-settings-sidebar">
          {/* Card: Administrator decision controls */}
          {isAdmin ? (
            <>
              <div className="editor-card">
                <h2>Review Decision</h2>
                <Link
                  to={`/dashboard/posts/${post.id}/edit`}
                  className="review-edit-before-publish-btn"
                >
                  <FileEdit size={14} />
                  <span>Edit Before Publishing</span>
                </Link>
                <ReviewActions post={post} adminId={user.id} />
              </div>

              <div className="editor-card">
                <h2>Review Notes</h2>
                <ReviewNotes postId={post.id} userId={user.id} isAdmin={true} />
              </div>
            </>
          ) : (
            <>
              {/* Contributor: current status guidance */}
              <div className="editor-card">
                <h2>Current Status</h2>
                <div className="review-contributor-status-block">
                  <StatusBadge status={post.status} />
                  {contributorStatus === 'draft' && (
                    <>
                      <p className="review-contributor-hint">
                        Your post was returned with feedback. Apply the changes and resubmit it for review.
                      </p>
                      <Link
                        to={`/dashboard/posts/${post.id}/edit`}
                        className="edit-action-btn"
                      >
                        <FileEdit size={14} />
                        <span>Edit Draft</span>
                      </Link>
                    </>
                  )}
                  {contributorStatus === 'in_review' && (
                    <p className="review-contributor-hint">
                      Awaiting Review — an administrator will look at your submission shortly.
                    </p>
                  )}
                  {contributorStatus === 'published' && (
                    <p className="review-contributor-hint">
                      Published — your post has been approved and is live.
                    </p>
                  )}
                </div>
              </div>

              <div className="editor-card">
                <h2>Editorial Feedback</h2>
                <ReviewNotes postId={post.id} userId={user.id} isAdmin={false} />
                {contributorStatus !== 'draft' && (
                  <p className="uploader-hint" style={{ marginTop: '12px' }}>
                    <MessageSquareText size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                    If an administrator returns this post to draft, you will be able to edit it from here.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
