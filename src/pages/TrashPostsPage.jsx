import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import StatusBadge from '../components/posts/StatusBadge'
import PermanentDeleteModal from '../components/posts/PermanentDeleteModal'
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2
} from 'lucide-react'
import '../styles/posts.css'

export default function TrashPostsPage() {
  const { user, profile, loading: authLoading } = useAuth()

  const userRole = (profile?.role || 'contributor').toLowerCase()
  const isSuperAdmin = userRole === 'super_admin'
  const isCommsAdmin = userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'
  const isContributor = userRole === 'contributor'

  const canRestore = isSuperAdmin || isCommsAdmin || isSupervisor

  const [trashedPosts, setTrashedPosts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Modal State for Permanent Delete (Super Admin only)
  const [postToPermanentDelete, setPostToPermanentDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // State for inline restoring
  const [restoringId, setRestoringId] = useState(null)

  // Supervisor team author IDs
  const [teamAuthorIds, setTeamAuthorIds] = useState(null)

  // Load supervisor team assignments if supervisor
  useEffect(() => {
    if (authLoading || !profile?.id) return
    if (isSupervisor) {
      supabase
        .from('supervisor_assignments')
        .select('contributor_id')
        .eq('supervisor_id', profile.id)
        .eq('is_active', true)
        .then(({ data, error }) => {
          if (error) {
            console.warn('Supervisor assignments load warning:', error)
            setTeamAuthorIds([profile.id])
          } else {
            const contribIds = (data || []).map((a) => a.contributor_id)
            setTeamAuthorIds([profile.id, ...contribIds])
          }
        })
    }
  }, [authLoading, profile?.id, isSupervisor])

  // Fetch trashed posts
  const loadTrashedPosts = async (isMounted = true) => {
    if (authLoading) return
    if (isSupervisor && teamAuthorIds === null) return // wait for team assignments

    setIsLoading(true)
    setError(null)

    try {
      // Build Count Query for Trashed Posts
      let countQuery = supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null)

      // Apply Role Scope
      if (isContributor) {
        countQuery = countQuery.eq('author_id', user.id)
      } else if (isSupervisor && teamAuthorIds) {
        countQuery = countQuery.in('author_id', teamAuthorIds)
      }

      if (searchTerm) {
        countQuery = countQuery.ilike('title', `%${searchTerm}%`)
      }
      if (typeFilter) {
        countQuery = countQuery.eq('type', typeFilter)
      }

      const { count, error: countErr } = await countQuery
      if (countErr) throw countErr

      if (isMounted) setTotalCount(count || 0)

      // Build Data Fetch Query
      let dataQuery = supabase
        .from('posts')
        .select(
          '*, author:profiles!posts_author_id_fkey(full_name, email), deleter:profiles!posts_deleted_by_fkey(full_name, email)'
        )
        .not('deleted_at', 'is', null)

      if (isContributor) {
        dataQuery = dataQuery.eq('author_id', user.id)
      } else if (isSupervisor && teamAuthorIds) {
        dataQuery = dataQuery.in('author_id', teamAuthorIds)
      }

      if (searchTerm) {
        dataQuery = dataQuery.ilike('title', `%${searchTerm}%`)
      }
      if (typeFilter) {
        dataQuery = dataQuery.eq('type', typeFilter)
      }

      dataQuery = dataQuery.order('deleted_at', { ascending: false })

      const from = (page - 1) * 10
      const to = from + 9
      dataQuery = dataQuery.range(from, to)

      let result = await dataQuery

      if (result.error) {
        console.warn('Trashed posts join query fallback:', result.error)
        // Fallback without joins
        let fallbackQuery = supabase
          .from('posts')
          .select('*')
          .not('deleted_at', 'is', null)

        if (isContributor) {
          fallbackQuery = fallbackQuery.eq('author_id', user.id)
        } else if (isSupervisor && teamAuthorIds) {
          fallbackQuery = fallbackQuery.in('author_id', teamAuthorIds)
        }

        if (searchTerm) fallbackQuery = fallbackQuery.ilike('title', `%${searchTerm}%`)
        if (typeFilter) fallbackQuery = fallbackQuery.eq('type', typeFilter)
        fallbackQuery = fallbackQuery.order('deleted_at', { ascending: false }).range(from, to)

        result = await fallbackQuery
      }

      if (result.error) throw result.error

      if (isMounted) {
        setTrashedPosts(result.data || [])
      }
    } catch (err) {
      console.error('Error loading trashed posts:', err)
      if (isMounted) setError(err)
    } finally {
      if (isMounted) setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    loadTrashedPosts(isMounted)
    return () => {
      isMounted = false
    }
  }, [filtersKey(searchTerm, typeFilter, page, authLoading, teamAuthorIds)])

  function filtersKey(s, t, p, al, tay) {
    return `${s}_${t}_${p}_${al}_${tay ? tay.join(',') : ''}`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '-'
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return '-'
    }
  }

  const resolveAuthor = (post) => {
    if (post.author?.full_name) return post.author.full_name
    if (post.author?.email) return post.author.email
    return 'Unknown author'
  }

  const resolveDeleter = (post) => {
    if (post.deleter?.full_name) return post.deleter.full_name
    if (post.deleter?.email) return post.deleter.email
    return 'System / Admin'
  }

  const formatType = (typeStr) => {
    if (!typeStr) return '-'
    return typeStr
      .split(/[_-]+|\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  }

  // Restore post handler
  const handleRestorePost = async (post) => {
    if (!canRestore) return
    setRestoringId(post.id)
    setFlash(null)

    try {
      // Try RPC first for transaction safety
      let restoredRow = null
      const { data: rpcData, error: rpcErr } = await supabase.rpc('restore_post', {
        p_post_id: post.id
      })

      if (rpcErr) {
        console.warn('restore_post RPC failed, executing direct update fallback:', rpcErr)
        // Direct update fallback requiring returned row
        const targetStatus =
          post.status_before_delete === 'published' ? 'draft' : post.status_before_delete || 'draft'

        const { data: updateData, error: updateErr } = await supabase
          .from('posts')
          .update({
            status: targetStatus,
            deleted_at: null,
            deleted_by: null,
            status_before_delete: null,
            hero_position: 'none',
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id)
          .select('id, title, status')
          .single()

        if (updateErr) throw updateErr
        restoredRow = updateData
      } else {
        restoredRow = rpcData
      }

      if (!restoredRow) {
        throw new Error('No post row was updated during restore.')
      }

      // Success feedback & state update
      setFlash({
        type: 'success',
        message: `Restored ‘${post.title || 'Untitled'}’ successfully. Restored status set to ${restoredRow.status || 'draft'}.`
      })

      await loadTrashedPosts(true)
    } catch (err) {
      console.error('Error restoring post:', err)
      setFlash({
        type: 'error',
        message: err.message || 'Failed to restore post from trash.'
      })
    } finally {
      setRestoringId(null)
    }
  }

  // Confirm Permanent Deletion (Super Admin only)
  const handleConfirmPermanentDelete = async (post) => {
    if (!isSuperAdmin) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      let deletedRow = null

      // Try RPC first
      const { data: rpcData, error: rpcErr } = await supabase.rpc('permanently_delete_post', {
        p_post_id: post.id
      })

      if (rpcErr) {
        console.warn('permanently_delete_post RPC failed, running cascading fallback delete:', rpcErr)
        // Manual relations cleanup + delete returning affected row
        await supabase.from('post_categories').delete().eq('post_id', post.id)
        await supabase.from('post_gallery_images').delete().eq('post_id', post.id)
        await supabase.from('review_notes').delete().eq('post_id', post.id)

        const { data: delData, error: delErr } = await supabase
          .from('posts')
          .delete()
          .eq('id', post.id)
          .select('id, title')
          .single()

        if (delErr) throw delErr
        deletedRow = delData
      } else {
        deletedRow = rpcData
      }

      if (!deletedRow) {
        throw new Error('No row was deleted during permanent deletion.')
      }

      setPostToPermanentDelete(null)
      setFlash({
        type: 'success',
        message: `Permanently deleted ‘${post.title || 'Untitled'}’. Media assets were preserved in Media Library.`
      })

      await loadTrashedPosts(true)
    } catch (err) {
      console.error('Error permanently deleting post:', err)
      setDeleteError(err)
    } finally {
      setIsDeleting(false)
    }
  }

  const totalPages = Math.ceil(totalCount / 10)

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--aasu-error-red)' }} />
        <h3>Failed to Load Trash</h3>
        <p>An unexpected database error occurred while querying the AASU CMS trash items.</p>
        <button className="retry-btn" onClick={() => loadTrashedPosts(true)}>
          <RefreshCw size={16} />
          <span>Retry Connection</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      {/* Header */}
      <div
        className="panel-header"
        style={{
          border: 'none',
          padding: '0 0 24px 0',
          background: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={24} style={{ color: '#DC2626' }} />
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
              {isSuperAdmin || isCommsAdmin ? 'Global Trash' : isSupervisor ? 'Team Trash' : 'My Trash'}
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            Posts in the trash are hidden from the public website and can be restored or permanently removed.
          </p>
        </div>
      </div>

      {/* Flash Notice Banner */}
      {flash && (
        <div className={`editor-notification-banner ${flash.type}`} style={{ marginBottom: '24px' }}>
          {flash.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <span>{flash.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="posts-filter-bar" style={{ marginBottom: '24px' }}>
        <div className="filter-group search">
          <label htmlFor="trash-search">Search Trash</label>
          <div className="search-input-wrapper" style={{ position: 'relative' }}>
            <input
              id="trash-search"
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Search by title..."
              className="filter-input"
            />
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="trash-type">Content Type</label>
          <select
            id="trash-type"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(1)
            }}
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
      </div>

      {/* Trashed Posts List */}
      {isLoading ? (
        <div className="posts-card-container" style={{ padding: '24px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton skeleton-text" style={{ width: '100%', height: '24px', marginBottom: '12px' }} />
          ))}
        </div>
      ) : trashedPosts.length === 0 ? (
        <div className="posts-card-container">
          <div className="empty-state">
            <Trash2 size={48} className="empty-state-icon" style={{ color: '#94A3B8' }} />
            <h3>Trash is Empty</h3>
            <p>
              {searchTerm || typeFilter
                ? 'No trashed posts match your selected filter.'
                : 'There are no items currently in the trash.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="posts-card-container">
            {/* Desktop Table View */}
            <table className="posts-list-table" aria-label="CMS Trashed Posts">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '56px', minWidth: '56px' }}>Image</th>
                  <th scope="col" style={{ minWidth: '200px' }}>Title</th>
                  <th scope="col" style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>Type</th>
                  <th scope="col" style={{ minWidth: '120px' }}>Original Author</th>
                  <th scope="col" style={{ minWidth: '110px', whiteSpace: 'nowrap' }}>Prev Status</th>
                  <th scope="col" style={{ minWidth: '120px' }}>Deleted By</th>
                  <th scope="col" style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Deleted Date</th>
                  <th scope="col" style={{ width: '140px' }}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {trashedPosts.map((post) => {
                  const isRestoring = restoringId === post.id
                  return (
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
                        <span className="post-title-cell-bold">{post.title || 'Untitled'}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatType(post.type)}</td>
                      <td>{resolveAuthor(post)}</td>
                      <td>
                        <StatusBadge status={post.status_before_delete || 'draft'} />
                      </td>
                      <td>{resolveDeleter(post)}</td>
                      <td>{formatDate(post.deleted_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {canRestore && (
                            <button
                              type="button"
                              className="edit-action-btn"
                              onClick={() => handleRestorePost(post)}
                              disabled={isRestoring}
                              title="Restore post from trash"
                            >
                              {isRestoring ? (
                                <Loader2 size={14} className="spin-icon" />
                              ) : (
                                <RotateCcw size={14} />
                              )}
                              <span>Restore</span>
                            </button>
                          )}

                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="edit-action-btn"
                              onClick={() => setPostToPermanentDelete(post)}
                              style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                              title="Permanently delete post (Super Admin)"
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile Grid View */}
            <div className="posts-mobile-grid">
              {trashedPosts.map((post) => (
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
                      <span className="post-mobile-title">{post.title || 'Untitled'}</span>
                    </div>
                  </div>

                  <div className="post-mobile-details">
                    <div className="mobile-detail-item">
                      <span className="mobile-detail-label">Author</span>
                      <span className="mobile-detail-value">{resolveAuthor(post)}</span>
                    </div>
                    <div className="mobile-detail-item">
                      <span className="mobile-detail-label">Previous Status</span>
                      <span className="mobile-detail-value">
                        <StatusBadge status={post.status_before_delete || 'draft'} />
                      </span>
                    </div>
                    <div className="mobile-detail-item">
                      <span className="mobile-detail-label">Deleted By</span>
                      <span className="mobile-detail-value">{resolveDeleter(post)}</span>
                    </div>
                    <div className="mobile-detail-item">
                      <span className="mobile-detail-label">Deleted Date</span>
                      <span className="mobile-detail-value">{formatDate(post.deleted_at)}</span>
                    </div>
                  </div>

                  <div className="post-mobile-actions" style={{ gap: '8px' }}>
                    {canRestore && (
                      <button
                        type="button"
                        className="edit-action-btn"
                        onClick={() => handleRestorePost(post)}
                        disabled={restoringId === post.id}
                      >
                        {restoringId === post.id ? <Loader2 size={14} className="spin-icon" /> : <RotateCcw size={14} />}
                        <span>Restore Post</span>
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        className="edit-action-btn"
                        onClick={() => setPostToPermanentDelete(post)}
                        style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                      >
                        <Trash2 size={14} />
                        <span>Delete Permanently</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} total trashed posts)
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  aria-label="Previous Page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  aria-label="Next Page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Permanent Delete Modal */}
      {postToPermanentDelete && (
        <PermanentDeleteModal
          post={postToPermanentDelete}
          onConfirm={handleConfirmPermanentDelete}
          onCancel={() => {
            setPostToPermanentDelete(null)
            setDeleteError(null)
          }}
          isSubmitting={isDeleting}
          error={deleteError}
        />
      )}
    </div>
  )
}
