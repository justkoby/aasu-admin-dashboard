import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import StatCard from '../components/dashboard/StatCard'
import {
  Users,
  FileText,
  ClipboardList,
  CheckCircle2,
  Plus,
  RefreshCw,
  AlertTriangle,
  FileEdit,
  Clock
} from 'lucide-react'

/**
 * Supervisor Dashboard — shows stats scoped to the supervisor's assigned team.
 * Renders at /dashboard when the authenticated user has role = supervisor.
 */
export default function SupervisorDashboardPage() {
  const navigate = useNavigate()
  const { profile, user, loading: authLoading } = useAuth()

  const [stats, setStats] = useState({
    contributors: 0,
    teamPosts: 0,
    awaitingReview: 0,
    published: 0
  })
  const [recentPosts, setRecentPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = async (isMounted = true) => {
    if (authLoading || !profile?.id) return
    setIsLoading(true)
    setError(null)
    try {
      // 1. Get assigned contributor IDs
      const { data: assignments, error: assErr } = await supabase
        .from('supervisor_assignments')
        .select('contributor_id')
        .eq('supervisor_id', profile.id)
        .eq('is_active', true)

      if (assErr) throw assErr
      const contributorIds = (assignments || []).map(a => a.contributor_id)

      // Author scope: own posts + all assigned contributor posts
      const authorIds = [profile.id, ...contributorIds]

      if (!isMounted) return

      if (isMounted) {
        setStats(s => ({ ...s, contributors: contributorIds.length }))
      }

      // 2. Team posts stats (excluding trashed posts)
      const { data: allTeamPosts, error: postsErr } = await supabase
        .from('posts')
        .select('id, status')
        .is('deleted_at', null)
        .in('author_id', authorIds)

      if (postsErr) throw postsErr
      const teamPosts = allTeamPosts || []

      if (isMounted) {
        setStats(s => ({
          ...s,
          teamPosts: teamPosts.length,
          awaitingReview: teamPosts.filter(p => p.status === 'in_review').length,
          published: teamPosts.filter(p => p.status === 'published').length
        }))
      }

      // 3. Recent team posts (excluding trashed posts)
      let recentData = []
      try {
        const { data, error: recentErr } = await supabase
          .from('posts')
          .select('id, title, status, type, updated_at, created_at, author:profiles!posts_author_id_fkey(full_name, email)')
          .is('deleted_at', null)
          .in('author_id', authorIds)
          .order('updated_at', { ascending: false })
          .limit(8)
        if (recentErr) throw recentErr
        recentData = data || []
      } catch {
        const { data } = await supabase
          .from('posts')
          .select('id, title, status, type, updated_at, created_at')
          .is('deleted_at', null)
          .in('author_id', authorIds)
          .order('updated_at', { ascending: false })
          .limit(8)
        recentData = data || []
      }

      if (isMounted) setRecentPosts(recentData)
    } catch (err) {
      console.error('Supervisor dashboard load error:', err)
      if (isMounted) setError(err)
    } finally {
      if (isMounted) setIsLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    let isMounted = true
    loadData(isMounted)
    return () => { isMounted = false }
  }, [authLoading, profile?.id])

  const formatDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return '—' }
  }

  const resolveAuthor = (post) => {
    if (post.author?.full_name) return post.author.full_name
    if (post.author?.email) return post.author.email
    return 'Unknown'
  }

  const STATUS_STYLES = {
    published: { background: 'var(--dash-red-light)', color: 'var(--dash-red)' },
    draft: { background: '#FEF3C7', color: '#D97706' },
    in_review: { background: '#E0E7FF', color: '#4F46E5' },
  }

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: '#DC2626' }} />
        <h3>Failed to Load Dashboard</h3>
        <p>An error occurred while fetching team data. Please try again.</p>
        <button className="retry-btn" onClick={() => loadData(true)}>
          <RefreshCw size={16} /><span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      {/* Welcome Banner */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)', margin: 0 }}>
          Welcome back, {profile?.full_name?.split(' ')[0] || 'Supervisor'} 👋
        </h2>
        <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
          Here's an overview of your team's activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="My Contributors"
          value={stats.contributors}
          icon={<Users size={24} />}
          type="total"
          loading={isLoading}
        />
        <StatCard
          title="Team Posts"
          value={stats.teamPosts}
          icon={<FileText size={24} />}
          type="drafts"
          loading={isLoading}
        />
        <StatCard
          title="Awaiting My Review"
          value={stats.awaitingReview}
          icon={<ClipboardList size={24} />}
          type="review"
          loading={isLoading}
        />
        <StatCard
          title="Published"
          value={stats.published}
          icon={<CheckCircle2 size={24} />}
          type="published"
          loading={isLoading}
        />
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <Link to="/dashboard/team-posts" className="create-post-action-btn" style={{ background: 'var(--dash-navy)' }}>
          <FileText size={16} />
          <span>View Team Posts</span>
        </Link>
        <Link to="/dashboard/review" className="create-post-action-btn">
          <ClipboardList size={16} />
          <span>Review Queue {stats.awaitingReview > 0 ? `(${stats.awaitingReview})` : ''}</span>
        </Link>
        <Link to="/dashboard/posts/new" className="create-post-action-btn" style={{ background: '#475569' }}>
          <Plus size={16} />
          <span>Write New Post</span>
        </Link>
      </div>

      {/* Recent Team Posts */}
      <div className="panel-card">
        <div className="panel-header">
          <h2>Recent Team Activity</h2>
          <Link to="/dashboard/team-posts" className="edit-action-btn">
            View All Posts
          </Link>
        </div>
        <div className="table-responsive">
          {isLoading ? (
            <div style={{ padding: '24px' }}>
              {[1,2,3].map(i => (
                <div key={i} className="skeleton skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '12px' }} />
              ))}
            </div>
          ) : recentPosts.length === 0 ? (
            <div className="empty-state">
              <FileText size={40} className="empty-state-icon" />
              <h3>No team posts yet</h3>
              <p>Posts from you and your assigned contributors will appear here.</p>
            </div>
          ) : (
            <table className="posts-table" aria-label="Recent team posts">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Author</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map(post => {
                  const st = (post.status || 'draft').toLowerCase()
                  const stStyle = STATUS_STYLES[st] || {}
                  return (
                    <tr key={post.id}>
                      <td className="post-title-cell">
                        <Link to={`/dashboard/posts/${post.id}/edit`} style={{ color: 'var(--dash-navy)', textDecoration: 'none', fontWeight: 700 }}>
                          {post.title || 'Untitled'}
                        </Link>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{post.type || '—'}</td>
                      <td>{resolveAuthor(post)}</td>
                      <td>
                        <span className="badge" style={stStyle}>
                          {post.status === 'in_review' ? 'In Review' : post.status || 'Draft'}
                        </span>
                      </td>
                      <td>{formatDate(post.updated_at || post.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
