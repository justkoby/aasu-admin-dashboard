import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import PostFilters from '../components/posts/PostFilters'
import PostsTable from '../components/posts/PostsTable'
import TrashConfirmModal from '../components/posts/TrashConfirmModal'
import { Plus, RefreshCw, FileText, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import '../styles/posts.css'

/**
 * Team Posts Page — Supervisor role only.
 * Shows the supervisor's own posts + all assigned contributor posts.
 * Joined with author and assigned_reviewer profile data.
 */
export default function TeamPostsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [flash, setFlash] = useState(null)
  const [categories, setCategories] = useState([])
  const [posts, setPosts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authorIds, setAuthorIds] = useState(null) // null = not loaded yet

  const [filters, setFilters] = useState({
    search: '',
    status: '',
    type: '',
    categoryId: '',
    sortBy: 'newest'
  })
  const [searchTerm, setSearchTerm] = useState('')

  // Trash handling state
  const [postToTrash, setPostToTrash] = useState(null)
  const [isTrashing, setIsTrashing] = useState(false)
  const [trashError, setTrashError] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchTerm }))
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    const state = location.state
    if (state?.message) {
      setFlash({ type: state.type || 'success', message: state.message })
      window.history.replaceState(null, '')
    }
  }, [location.state])

  // Load categories once
  useEffect(() => {
    let isMounted = true
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => { if (isMounted && data) setCategories(data) })
    return () => { isMounted = false }
  }, [])

  // Load assigned contributor IDs once
  useEffect(() => {
    if (authLoading || !profile?.id) return
    let isMounted = true
    supabase
      .from('supervisor_assignments')
      .select('contributor_id')
      .eq('supervisor_id', profile.id)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error) { console.warn('Supervisor assignments load failed:', error); setAuthorIds([profile.id]); return }
        const contributorIds = (data || []).map(a => a.contributor_id)
        setAuthorIds([profile.id, ...contributorIds])
      })
    return () => { isMounted = false }
  }, [authLoading, profile?.id])

  // Load posts
  const loadPosts = async (isMounted = true) => {
    if (authLoading || !authorIds) return
    setIsLoading(true)
    setError(null)

    try {
      // 1. Category filter
      let filteredPostIds = null
      if (filters.categoryId) {
        const { data: pcData, error: pcErr } = await supabase
          .from('post_categories').select('post_id').eq('category_id', filters.categoryId)
        if (pcErr) throw pcErr
        filteredPostIds = pcData.map(i => i.post_id)
        if (filteredPostIds.length === 0) {
          if (isMounted) { setPosts([]); setTotalCount(0); setIsLoading(false) }
          return
        }
      }

      // 2. Count query (excluding trashed posts)
      let countQ = supabase.from('posts').select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('author_id', authorIds)
      if (filters.search) countQ = countQ.ilike('title', `%${filters.search}%`)
      if (filters.status) countQ = countQ.eq('status', filters.status)
      if (filters.type)   countQ = countQ.eq('type', filters.type)
      if (filteredPostIds) countQ = countQ.in('id', filteredPostIds)
      const { count, error: countErr } = await countQ
      if (countErr) throw countErr
      if (isMounted) setTotalCount(count || 0)

      // 3. Data query with joins
      const runQuery = async (withJoin = true) => {
        let q = supabase.from('posts')
        q = withJoin
          ? q.select('*, author:profiles!posts_author_id_fkey(full_name, email), assigned_reviewer:profiles!posts_assigned_reviewer_id_fkey(full_name, email)')
          : q.select('*')
        q = q.is('deleted_at', null).in('author_id', authorIds)
        if (filters.search)   q = q.ilike('title', `%${filters.search}%`)
        if (filters.status)   q = q.eq('status', filters.status)
        if (filters.type)     q = q.eq('type', filters.type)
        if (filteredPostIds)  q = q.in('id', filteredPostIds)
        if (filters.sortBy === 'oldest') {
          q = q.order('created_at', { ascending: true })
        } else if (filters.sortBy === 'recently_updated') {
          q = q.order('updated_at', { ascending: false })
        } else {
          q = q.order('created_at', { ascending: false })
        }
        const from = (page - 1) * 10, to = from + 9
        return await q.range(from, to)
      }

      let result = await runQuery(true)
      if (result.error) {
        console.warn('Team posts join failed, using fallback:', result.error)
        result = await runQuery(false)
      }
      if (result.error) throw result.error
      if (isMounted) setPosts(result.data || [])
    } catch (err) {
      console.error('Error loading team posts:', err)
      if (isMounted) setError(err)
    } finally {
      if (isMounted) setIsLoading(false)
    }
  }

  const handleConfirmTrash = async (post) => {
    setIsTrashing(true)
    setTrashError(null)

    try {
      let trashedRow = null
      const { data: rpcData, error: rpcErr } = await supabase.rpc('trash_post', {
        p_post_id: post.id
      })

      if (rpcErr) {
        console.warn('trash_post RPC failed, running fallback update:', rpcErr)
        const { data: updateData, error: updateErr } = await supabase
          .from('posts')
          .update({
            status_before_delete: post.status,
            status: 'archived',
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            hero_position: 'none',
            featured_until: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id)
          .select('id, title')
          .single()

        if (updateErr) throw updateErr
        trashedRow = updateData
      } else {
        trashedRow = rpcData
      }

      if (!trashedRow) {
        throw new Error('No post row was updated during trash.')
      }

      setPostToTrash(null)
      setFlash({
        type: 'success',
        message: `Moved ‘${post.title || 'Untitled'}’ to Trash successfully.`
      })

      await loadPosts(true)
    } catch (err) {
      console.error('Error moving team post to trash:', err)
      setTrashError(err)
    } finally {
      setIsTrashing(false)
    }
  }

  useEffect(() => {
    if (authorIds === null) return // wait for assignment load
    let isMounted = true
    loadPosts(isMounted)
    return () => { isMounted = false }
  }, [filters, page, authorIds])

  const handleFilterChange = (name, value) => {
    if (name === 'search') { setSearchTerm(value) }
    else { setFilters(prev => ({ ...prev, [name]: value })); setPage(1) }
  }

  const totalPages = Math.ceil(totalCount / 10)

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--aasu-error-red)' }} />
        <h3>Failed to Load Team Posts</h3>
        <p>An unexpected error occurred. Please try again.</p>
        <button className="retry-btn" onClick={() => loadPosts(true)}>
          <RefreshCw size={16} /><span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      {/* Header */}
      <div className="panel-header" style={{ border: 'none', padding: '0 0 24px 0', background: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>Team Posts</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            All posts by you and your assigned contributors.
          </p>
        </div>
        <Link to="/dashboard/posts/new" className="create-post-action-btn">
          <Plus size={16} /><span>Add New Post</span>
        </Link>
      </div>

      {flash && (
        <div className={`editor-notification-banner ${flash.type}`} style={{ marginBottom: '24px' }}>
          {flash.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <span>{flash.message}</span>
        </div>
      )}

      <PostFilters
        filters={{ ...filters, search: searchTerm }}
        onFilterChange={handleFilterChange}
        categories={categories}
      />

      {isLoading ? (
        <div className="posts-card-container" style={{ padding: '24px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="posts-card-container">
          <div className="empty-state">
            <FileText size={48} className="empty-state-icon" />
            <h3>No team posts found</h3>
            <p>
              {searchTerm || filters.status || filters.type || filters.categoryId
                ? 'No posts match your current filters.'
                : 'No posts have been created by you or your contributors yet.'}
            </p>
            <Link to="/dashboard/posts/new" className="create-post-action-btn">
              <Plus size={16} /><span>Create First Post</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <PostsTable
            posts={posts}
            userRole={profile?.role}
            userId={user?.id}
            teamAuthorIds={authorIds || []}
            isContributor={false}
            showAssignedReviewer={true}
            onMoveToTrash={(post) => setPostToTrash(post)}
          />
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} total)
              </span>
              <div className="pagination-actions">
                <button type="button" className="page-btn" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="page-btn" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages} aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Trash Confirm Modal */}
      {postToTrash && (
        <TrashConfirmModal
          post={postToTrash}
          onConfirm={handleConfirmTrash}
          onCancel={() => {
            setPostToTrash(null)
            setTrashError(null)
          }}
          isSubmitting={isTrashing}
          error={trashError}
        />
      )}
    </div>
  )
}

