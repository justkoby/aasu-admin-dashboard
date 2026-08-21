import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import StatCard from '../components/dashboard/StatCard'
import {
  FileText,
  CheckCircle2,
  FileEdit,
  AlertCircle,
  Plus,
  RefreshCw,
  History,
  AlertTriangle
} from 'lucide-react'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    drafts: 0,
    review: 0
  })
  const [recentPosts, setRecentPosts] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDashboardData = async (isMounted) => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Fetch stats
      const { data: allPosts, error: statsError } = await supabase
        .from('posts')
        .select('status')
      
      if (statsError) throw statsError

      if (isMounted) {
        const total = allPosts.length
        const published = allPosts.filter((p) => p.status === 'published').length
        const drafts = allPosts.filter((p) => p.status === 'draft').length
        const review = allPosts.filter(
          (p) => p.status === 'in_review'
        ).length

        setStats({ total, published, drafts, review })
      }

      // 2. Fetch recent posts
      let postsData = []
      try {
        const { data, error: postsErr } = await supabase
          .from('posts')
          .select('*, profiles(full_name)')
          .order('updated_at', { ascending: false })
          .limit(10)
        
        if (postsErr) throw postsErr
        postsData = data
      } catch (e) {
        console.warn('Posts with profiles join failed, running fallback query:', e)
        const { data, error: fallbackErr } = await supabase
          .from('posts')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(10)
        
        if (fallbackErr) throw fallbackErr
        postsData = data
      }

      if (isMounted) {
        setRecentPosts(postsData)
      }

      // 3. Fetch recent activity (Admin only)
      if (profile?.role === 'super_admin' || profile?.role === 'communications_admin') {
        let logsData = []
        try {
          const { data, error: logsErr } = await supabase
            .from('activity_logs')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(8)
          
          if (logsErr) throw logsErr
          logsData = data
        } catch (e) {
          console.warn('Activity logs with profiles join failed, running fallback query:', e)
          const { data, error: fallbackLogsErr } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(8)
          
          if (fallbackLogsErr) throw fallbackLogsErr
          logsData = data
        }

        if (isMounted) {
          setActivityLogs(logsData)
        }
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err)
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
    if (authLoading) return

    let isMounted = true
    loadDashboardData(isMounted)

    return () => {
      isMounted = false
    }
  }, [authLoading, profile])

  const handleRetry = () => {
    loadDashboardData(true)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return 'N/A'
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (e) {
      return 'N/A'
    }
  }

  const renderHeroPlacement = (post) => {
    const val =
      post.hero_position !== undefined
        ? post.hero_position
        : post.hero_placement !== undefined
        ? post.hero_placement
        : post.is_hero !== undefined
        ? post.is_hero
        : post.hero
    
    if (val === 'primary' || val === 'Primary') {
      return <span className="badge hero-yes">Primary</span>
    }
    if (val === 'secondary' || val === 'Secondary') {
      return <span className="badge hero-yes" style={{ backgroundColor: 'var(--dash-gold-light)', color: '#926E2D' }}>Secondary</span>
    }
    if (val === true || val === 'true' || val === 'Yes') {
      return <span className="badge hero-yes">Yes</span>
    }
    return <span className="badge hero-no">No</span>
  }

  const handleCreatePost = () => {
    navigate('/dashboard/posts/new')
  }

  // Render error screen
  if (error) {
    const isConnectionFailure =
      error.message?.toLowerCase().includes('failed to fetch') ||
      error.message?.toLowerCase().includes('networkerror')
    
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: 'var(--ausu-error-red)' }} />
        <h3>Failed to Load Dashboard</h3>
        <p>
          {isConnectionFailure
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

  const showActivityLogs =
    profile?.role === 'super_admin' || profile?.role === 'communications_admin'

  return (
    <div className="dashboard-content-wrapper">
      {/* 1. Stat Cards Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Posts"
          value={stats.total}
          icon={<FileText size={24} />}
          type="total"
          loading={isLoading}
        />
        <StatCard
          title="Published"
          value={stats.published}
          icon={<CheckCircle2 size={24} />}
          type="published"
          loading={isLoading}
        />
        <StatCard
          title="Drafts"
          value={stats.drafts}
          icon={<FileEdit size={24} />}
          type="drafts"
          loading={isLoading}
        />
        <StatCard
          title="Awaiting Review"
          value={stats.review}
          icon={<AlertCircle size={24} />}
          type="review"
          loading={isLoading}
        />
      </div>

      {/* 2. Main Panels Grid */}
      <div className={`dashboard-grid-panels ${!showActivityLogs ? 'single-column' : ''}`}>
        
        {/* Recent Posts Panel */}
        <div className="panel-card">
          <div className="panel-header">
            <h2>Recent Posts</h2>
            <button className="create-post-action-btn" onClick={handleCreatePost}>
              <Plus size={16} />
              <span>Create New Post</span>
            </button>
          </div>

          <div className="table-responsive">
            {isLoading ? (
              // Table Loading Skeletons
              <div style={{ padding: '24px' }}>
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '24px', marginBottom: '12px' }}></div>
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }}></div>
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '20px' }}></div>
              </div>
            ) : recentPosts.length === 0 ? (
              // Table Empty State
              <div className="empty-state">
                <FileText size={40} className="empty-state-icon" />
                <h3>No posts found</h3>
                <p>There are no posts created in the database yet. Get started by creating the first one.</p>
                <button className="create-post-action-btn" onClick={handleCreatePost}>
                  <Plus size={16} />
                  <span>Create First Post</span>
                </button>
              </div>
            ) : (
              // Table Data Render
              <table className="posts-table" aria-label="Recent CMS Posts">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Author</th>
                    <th>Updated Date</th>
                    <th>Hero</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPosts.map((post) => (
                    <tr key={post.id}>
                      <td className="post-title-cell">{post.title || 'Untitled'}</td>
                      <td>{post.type || 'Post'}</td>
                      <td>
                        <span className={`badge status-${(post.status || 'draft').toLowerCase()}`}>
                          {post.status || 'Draft'}
                        </span>
                      </td>
                      <td>
                        {post.profiles?.full_name ||
                          post.author_name ||
                          post.author_id ||
                          'Unknown'}
                      </td>
                      <td>{formatDate(post.updated_at || post.created_at)}</td>
                      <td>{renderHeroPlacement(post)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Activity Log Panel (Admin only) */}
        {showActivityLogs && (
          <div className="panel-card">
            <div className="panel-header">
              <h2>Recent Activity</h2>
            </div>
            
            <div className="activity-list">
              {isLoading ? (
                // Activity Loading Skeletons
                <>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div className="skeleton skeleton-circle"></div>
                    <div className="skeleton skeleton-text" style={{ width: '70%', height: '16px' }}></div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div className="skeleton skeleton-circle"></div>
                    <div className="skeleton skeleton-text" style={{ width: '60%', height: '16px' }}></div>
                  </div>
                </>
              ) : activityLogs.length === 0 ? (
                // Activity Empty State
                <div className="empty-state" style={{ padding: '24px 12px' }}>
                  <History size={32} className="empty-state-icon" />
                  <h3>No activity logs</h3>
                  <p style={{ fontSize: '13px' }}>System and administrator actions will be logged here.</p>
                </div>
              ) : (
                // Activity List Render
                activityLogs.map((log) => (
                  <div className="activity-item" key={log.id}>
                    <div className="activity-icon-wrapper">
                      <History size={16} />
                    </div>
                    <div className="activity-details">
                      <span className="activity-text">
                        <strong>
                          {log.profiles?.full_name || log.user_email || 'System'}
                        </strong>{' '}
                        {log.action || log.description || log.message}
                      </span>
                      <span className="activity-time">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
