import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import PostFilters from '../components/posts/PostFilters'
import PostsTable from '../components/posts/PostsTable'
import { Plus, RefreshCw, FileText, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import '../styles/posts.css'

export default function PostsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Categories list state
  const [categories, setCategories] = useState([])
  
  // Posts list states
  const [posts, setPosts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters state
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    type: '',
    categoryId: '',
    sortBy: 'newest'
  })

  // Debounced search term (simple implementation)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchTerm }))
      setPage(1) // Reset to page 1 on search
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch categories on mount
  useEffect(() => {
    let isMounted = true
    const fetchCategories = async () => {
      try {
        const { data, error: catErr } = await supabase
          .from('categories')
          .select('id, name')
          .order('name')
        
        if (catErr) throw catErr
        if (isMounted) setCategories(data || [])
      } catch (err) {
        console.error('Error loading categories:', err)
      }
    }
    fetchCategories()
    return () => {
      isMounted = false
    }
  }, [])

  // Load posts whenever filters, page, or profile changes
  const loadPosts = async (isMounted = true) => {
    if (authLoading) return
    setIsLoading(true)
    setError(null)

    try {
      // 1. Resolve category filter if active
      let filteredPostIds = null
      if (filters.categoryId) {
        const { data: pcData, error: pcErr } = await supabase
          .from('post_categories')
          .select('post_id')
          .eq('category_id', filters.categoryId)
        
        if (pcErr) throw pcErr
        filteredPostIds = pcData.map((item) => item.post_id)
        
        // If category has no posts, skip querying database and return empty
        if (filteredPostIds.length === 0) {
          if (isMounted) {
            setPosts([])
            setTotalCount(0)
            setIsLoading(false)
          }
          return
        }
      }

      // 2. Build Count Query
      let countQuery = supabase.from('posts').select('*', { count: 'exact', head: true })

      // Apply Role filters
      if (profile?.role === 'contributor') {
        countQuery = countQuery.eq('author_id', user.id)
      }

      // Apply Text Search
      if (filters.search) {
        countQuery = countQuery.ilike('title', `%${filters.search}%`)
      }

      // Apply Dropdown Filters
      if (filters.status) {
        countQuery = countQuery.eq('status', filters.status)
      }
      if (filters.type) {
        countQuery = countQuery.eq('type', filters.type)
      }
      if (filteredPostIds) {
        countQuery = countQuery.in('id', filteredPostIds)
      }

      const { count, error: countErr } = await countQuery
      if (countErr) throw countErr

      if (isMounted) {
        setTotalCount(count || 0)
      }

      // 3. Build Data Fetching Query (with robust profile join fallbacks)
      let dataQuery = null
      let useFallback = false

      const runQuery = async (queryWithJoin = true) => {
        let q = supabase.from('posts')

        if (queryWithJoin) {
          // Use the explicit FK alias so Supabase resolves the correct relation
          // even when multiple FK paths exist between posts and profiles.
          q = q.select(
            '*, author:profiles!posts_author_id_fkey(full_name, email)'
          )
        } else {
          // Fallback: no join — author column will show 'Unknown author'
          q = q.select('*')
        }

        // Apply filters
        if (profile?.role === 'contributor') {
          q = q.eq('author_id', user.id)
        }
        if (filters.search) {
          q = q.ilike('title', `%${filters.search}%`)
        }
        if (filters.status) {
          q = q.eq('status', filters.status)
        }
        if (filters.type) {
          q = q.eq('type', filters.type)
        }
        if (filteredPostIds) {
          q = q.in('id', filteredPostIds)
        }

        // Apply sorting
        if (filters.sortBy === 'oldest') {
          q = q.order('created_at', { ascending: true })
        } else if (filters.sortBy === 'recently_updated') {
          q = q.order('updated_at', { ascending: false })
        } else {
          // Default newest
          q = q.order('created_at', { ascending: false })
        }

        // Apply pagination ranges
        const from = (page - 1) * 10
        const to = from + 9
        q = q.range(from, to)

        return await q
      }

      let result = await runQuery(true)
      if (result.error) {
        console.warn('Posts with profiles query failed, falling back to select(*):', result.error)
        useFallback = true
        result = await runQuery(false)
      }

      if (result.error) throw result.error

      if (isMounted) {
        setPosts(result.data || [])
      }
    } catch (err) {
      console.error('Error loading posts data:', err)
      if (isMounted) {
        setError(err)
      }
    } finally {
      if (isMounted) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    let isMounted = true
    loadPosts(isMounted)
    return () => {
      isMounted = false
    }
  }, [filters, page, authLoading])

  const handleFilterChange = (name, value) => {
    if (name === 'search') {
      setSearchTerm(value) // Triggers debounce
    } else {
      setFilters((prev) => ({ ...prev, [name]: value }))
      setPage(1) // Reset page on filter change
    }
  }

  const handleRetry = () => {
    loadPosts(true)
  }

  const totalPages = Math.ceil(totalCount / 10)

  // Render error state
  if (error) {
    const isConnErr =
      error.message?.toLowerCase().includes('failed to fetch') ||
      error.message?.toLowerCase().includes('networkerror')
    
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--aasu-error-red)' }} />
        <h3>Failed to Load Posts</h3>
        <p>
          {isConnErr
            ? 'Connection failed. Please check your network connection and try again.'
            : 'An unexpected database error occurred while querying the AASU CMS.'}
        </p>
        <button className="retry-btn" onClick={handleRetry}>
          <RefreshCw size={16} />
          <span>Retry Connection</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      {/* Page Header */}
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
            {profile?.role === 'contributor' ? 'My Posts' : 'All Posts'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            Manage and compile drafts, articles, reviews, and published updates.
          </p>
        </div>

        <Link to="/dashboard/posts/new" className="create-post-action-btn">
          <Plus size={16} />
          <span>Add New Post</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <PostFilters
        filters={{ ...filters, search: searchTerm }}
        onFilterChange={handleFilterChange}
        categories={categories}
      />

      {/* Posts Table List */}
      {isLoading ? (
        // Loading skeletons
        <div className="posts-card-container" style={{ padding: '24px' }}>
          <div className="skeleton skeleton-title" style={{ width: '40%', height: '24px', marginBottom: '20px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px' }}></div>
        </div>
      ) : posts.length === 0 ? (
        // Empty state
        <div className="posts-card-container">
          <div className="empty-state">
            <FileText size={48} className="empty-state-icon" />
            <h3>No posts found</h3>
            <p>
              {searchTerm || filters.status || filters.type || filters.categoryId
                ? 'No posts match your selected search query or filters. Clear them and try again.'
                : 'There are no CMS posts registered in the database yet.'}
            </p>
            <Link to="/dashboard/posts/new" className="create-post-action-btn">
              <Plus size={16} />
              <span>Create First Post</span>
            </Link>
          </div>
        </div>
      ) : (
        // Table list
        <>
          <PostsTable posts={posts} />

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} total posts)
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
    </div>
  )
}
