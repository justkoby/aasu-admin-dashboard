import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatRole } from '../utils/formatRole'
import {
  History,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  FileText,
  FileEdit,
  Send,
  RotateCcw,
  CheckCircle2,
  MessageSquare,
  Image,
  FolderKanban,
  Shield,
  UserCheck,
  Briefcase,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Info
} from 'lucide-react'
import '../styles/dashboard.css'
import '../styles/activity.css'

const logSupabaseError = (operation, error) => {
  if (!error) return
  console.error(`[AASU Activity Log] Supabase Error during ${operation}:`, {
    operation,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    errorObj: error
  })
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

// Map raw database action to friendly presentation label & icon
const resolveActionPresentation = (action, entityType, metadata = {}) => {
  const act = (action || '').toLowerCase()
  const type = (entityType || '').toLowerCase()

  if (act === 'post.created') {
    return { label: 'Created a post', category: 'post', icon: <FileText size={14} /> }
  }
  if (act === 'post.updated') {
    return { label: 'Updated draft', category: 'post', icon: <FileEdit size={14} /> }
  }
  if (act === 'post.submitted') {
    return { label: 'Submitted post for review', category: 'review', icon: <Send size={14} /> }
  }
  if (act === 'post.returned') {
    return { label: 'Returned post for changes', category: 'review', icon: <RotateCcw size={14} /> }
  }
  if (act === 'post.published') {
    return { label: 'Approved & published post', category: 'post', icon: <CheckCircle2 size={14} /> }
  }
  if (act === 'post.deleted') {
    return { label: 'Deleted a post', category: 'post', icon: <FileText size={14} /> }
  }
  if (act === 'review_note.added' || type === 'review_note') {
    return { label: 'Added an editorial note', category: 'review', icon: <MessageSquare size={14} /> }
  }
  if (act === 'media.uploaded') {
    return { label: 'Uploaded media asset', category: 'media', icon: <Image size={14} /> }
  }
  if (act === 'media.updated') {
    return { label: 'Updated media details', category: 'media', icon: <Image size={14} /> }
  }
  if (act === 'media.deleted') {
    return { label: 'Deleted media asset', category: 'media', icon: <Image size={14} /> }
  }
  if (act.startsWith('category.')) {
    return { label: 'Managed categories', category: 'category', icon: <FolderKanban size={14} /> }
  }
  if (act === 'user.role_changed') {
    return {
      label: `Changed role to ${formatRole(metadata.new_role || 'user')}`,
      category: 'user',
      icon: <Shield size={14} />
    }
  }
  if (act === 'user.status_changed') {
    return {
      label: metadata.is_active ? 'Reactivated account' : 'Deactivated account',
      category: 'user',
      icon: <UserCheck size={14} />
    }
  }
  if (act.startsWith('assignment.')) {
    return { label: 'Managed supervisor assignment', category: 'user', icon: <Briefcase size={14} /> }
  }

  const prettyLabel = act.split(/[\._-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return { label: prettyLabel || 'CMS Activity', category: 'user', icon: <History size={14} /> }
}

const resolveResourceTitle = (entityType, entityId, metadata = {}, postsMap = new Map()) => {
  if (metadata.title) return metadata.title

  if (entityType === 'post' && entityId) {
    if (postsMap.has(entityId)) {
      return postsMap.get(entityId).title
    }
    return `Deleted post (${entityId.slice(0, 8)}...)`
  }

  if (metadata.name) return metadata.name
  if (metadata.filename) return metadata.filename
  if (metadata.target_user_name) return metadata.target_user_name
  if (metadata.target_user_email) return metadata.target_user_email
  if (metadata.slug) return `/${metadata.slug}`
  
  if (entityType === 'category') return `Category #${(entityId || '').slice(0, 8)}`
  if (entityType === 'media') return `Media asset #${(entityId || '').slice(0, 8)}`
  if (entityType === 'user') return `User account`
  return entityId ? `Resource #${entityId.slice(0, 8)}` : 'CMS Resource'
}

export default function ActivityLogPage() {
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  const userRole = (profile?.role || '').toLowerCase()
  const isSuperAdmin = userRole === 'super_admin'
  const isCommunicationsAdmin = userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'
  const isContributor = userRole === 'contributor'

  // Data state
  const [logs, setLogs] = useState([])
  const [profilesMap, setProfilesMap] = useState(new Map())
  const [postsMap, setPostsMap] = useState(new Map())
  const [assignedContributorIds, setAssignedContributorIds] = useState(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // Filters state
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [resourceFilter, setResourceFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Modal detail item
  const [selectedLog, setSelectedLog] = useState(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Unnested Data Loading
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (authLoading) return
    setIsLoading(true)
    setError(null)
    setPermissionDenied(false)

    if (isContributor) {
      setPermissionDenied(true)
      setIsLoading(false)
      return
    }

    try {
      // 1. Fetch Profiles for actor info
      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')

      if (profErr) logSupabaseError('profiles.select', profErr)

      const pMap = new Map()
      if (profData) {
        profData.forEach(p => pMap.set(p.id, p))
      }
      setProfilesMap(pMap)

      // 2. Fetch Posts for post title resolution
      const { data: postData } = await supabase
        .from('posts')
        .select('id, title, slug')

      const poMap = new Map()
      if (postData) {
        postData.forEach(po => poMap.set(po.id, po))
      }
      setPostsMap(poMap)

      // 3. Supervisor assignments query to resolve team-scoped visibility
      const teamSet = new Set()
      if (isSupervisor && user?.id) {
        const { data: assData } = await supabase
          .from('supervisor_assignments')
          .select('contributor_id')
          .eq('supervisor_id', user.id)
          .eq('is_active', true)
        
        if (assData) {
          assData.forEach(a => teamSet.add(a.contributor_id))
        }
      }
      setAssignedContributorIds(teamSet)

      // 4. Query Activity Logs
      let query = supabase
        .from('activity_logs')
        .select('id, user_id, action, entity_type, entity_id, metadata, created_at')
        .order('created_at', { ascending: false })

      const { data: logData, error: logErr } = await query

      if (logErr) {
        logSupabaseError('activity_logs.select', logErr)
        if (logErr.code === '42P01') {
          setError({
            message: 'The activity_logs table is missing. Please run migration 003_activity_log_triggers.sql.'
          })
          setIsLoading(false)
          return
        }
        throw logErr
      }

      setLogs(logData || [])
    } catch (err) {
      logSupabaseError('loadData (exception)', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [authLoading, isContributor, isSupervisor, user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, categoryFilter, resourceFilter, roleFilter, dateFilter, sortOrder])

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered & Sorted Logs
  // ─────────────────────────────────────────────────────────────────────────

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const actor = profilesMap.get(log.user_id)
      const actorName = actor?.full_name || ''
      const actorEmail = actor?.email || ''
      const actorRole = (actor?.role || '').toLowerCase()

      if (isSupervisor) {
        const isOwnLog = log.user_id === user?.id
        const isTeamLog = assignedContributorIds.has(log.user_id)
        if (!isOwnLog && !isTeamLog) return false
      } else if (isCommunicationsAdmin) {
        const isContent = ['post', 'category', 'media', 'review_note'].includes((log.entity_type || '').toLowerCase())
        if (!isContent && log.user_id !== user?.id) return false
      }

      const term = searchTerm.trim().toLowerCase()
      if (term) {
        const resTitle = resolveResourceTitle(log.entity_type, log.entity_id, log.metadata || {}, postsMap).toLowerCase()
        const actLabel = resolveActionPresentation(log.action, log.entity_type, log.metadata || {}).label.toLowerCase()
        const matchActor = actorName.toLowerCase().includes(term) || actorEmail.toLowerCase().includes(term)
        const matchResource = resTitle.includes(term) || actLabel.includes(term) || (log.action || '').toLowerCase().includes(term)
        if (!matchActor && !matchResource) return false
      }

      if (categoryFilter !== 'all') {
        const cat = resolveActionPresentation(log.action, log.entity_type, log.metadata || {}).category
        if (cat !== categoryFilter) return false
      }

      if (resourceFilter !== 'all' && (log.entity_type || '').toLowerCase() !== resourceFilter) {
        return false
      }

      if (roleFilter !== 'all' && actorRole !== roleFilter) {
        return false
      }

      if (dateFilter !== 'all' && log.created_at) {
        const logDate = new Date(log.created_at)
        const now = new Date()
        if (dateFilter === 'today') {
          const isToday = logDate.toDateString() === now.toDateString()
          if (!isToday) return false
        } else if (dateFilter === '7days') {
          const diffDays = (now - logDate) / (1000 * 3600 * 24)
          if (diffDays > 7) return false
        } else if (dateFilter === '30days') {
          const diffDays = (now - logDate) / (1000 * 3600 * 24)
          if (diffDays > 30) return false
        }
      }

      return true
    }).sort((a, b) => {
      if (sortOrder === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at)
      }
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [logs, profilesMap, postsMap, isSupervisor, isCommunicationsAdmin, user?.id, assignedContributorIds, searchTerm, categoryFilter, resourceFilter, roleFilter, dateFilter, sortOrder])

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE) || 1
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredLogs, currentPage])

  // Helper to construct clickable resource links
  const getResourcePath = (entityType, entityId) => {
    if (!entityId) return null
    if (entityType === 'post' && postsMap.has(entityId)) {
      return `/dashboard/posts/${entityId}/edit`
    }
    if (entityType === 'category') return '/dashboard/categories'
    if (entityType === 'media') return '/dashboard/media'
    return null
  }

  if (permissionDenied) {
    return (
      <div className="dashboard-content-wrapper">
        <div className="error-state">
          <ShieldAlert size={48} className="error-state-icon" style={{ color: 'var(--dash-gold)' }} />
          <h3>Access Restricted</h3>
          <p>You do not have permission to view the global activity audit log.</p>
          <button className="retry-btn" onClick={() => navigate('/dashboard/posts')}>
            <ChevronLeft size={16} />
            <span>Back to My Posts</span>
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: '#DC2626' }} />
        <h3>Failed to Load Activity Log</h3>
        <p>{error.message || 'An error occurred while loading activity records.'}</p>
        <button className="retry-btn" onClick={loadData}>
          <RefreshCw size={16} />
          <span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      <div className="activity-page-header">
        <div>
          <h2>Activity Log</h2>
          <p>Audit trail of publishing events, editorial submissions, role changes, and system operations.</p>
        </div>
        <button
          type="button"
          className="activity-refresh-btn"
          onClick={loadData}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="activity-filter-bar">
        <div className="filter-group search">
          <label htmlFor="activity-search">Search</label>
          <input
            id="activity-search"
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search actor name, email, action, or resource title..."
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="action-category-filter">Category</label>
          <select
            id="action-category-filter"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            <option value="post">Posts</option>
            <option value="review">Reviews</option>
            <option value="media">Media</option>
            <option value="category">Categories</option>
            <option value="user">Users & Roles</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="resource-type-filter">Resource Type</label>
          <select
            id="resource-type-filter"
            value={resourceFilter}
            onChange={e => setResourceFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Resources</option>
            <option value="post">Posts</option>
            <option value="category">Categories</option>
            <option value="media">Media</option>
            <option value="user">Users</option>
            <option value="assignment">Assignments</option>
          </select>
        </div>

        {isSuperAdmin && (
          <div className="filter-group">
            <label htmlFor="actor-role-filter">Actor Role</label>
            <select
              id="actor-role-filter"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="communications_admin">Comms Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="contributor">Contributor</option>
            </select>
          </div>
        )}

        <div className="filter-group">
          <label htmlFor="date-range-filter">Timeframe</label>
          <select
            id="date-range-filter"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="sort-order-filter">Order</label>
          <select
            id="sort-order-filter"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="filter-select"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {!isLoading && (
        <p className="categories-summary-strip" style={{ marginBottom: '16px' }}>
          Showing <strong>{paginatedLogs.length}</strong> of <strong>{filteredLogs.length}</strong> activity records
        </p>
      )}

      {isLoading ? (
        <div className="activity-card-container" style={{ padding: '24px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div className="skeleton skeleton-circle" />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '40%', height: '16px', marginBottom: '8px' }} />
                <div className="skeleton skeleton-text" style={{ width: '60%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="activity-card-container">
          <div className="empty-state">
            <History size={48} className="empty-state-icon" />
            <h3>No activity records found</h3>
            <p>
              {searchTerm || categoryFilter !== 'all' || resourceFilter !== 'all' || dateFilter !== 'all'
                ? 'No activities match your current search and filter criteria. Clear filters and try again.'
                : 'No activities have been recorded in the system yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="activity-card-container">
          <table className="activity-list-table" aria-label="AASU Activity Log">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Date & Time</th>
                <th><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map(log => {
                const actor = profilesMap.get(log.user_id)
                const actorName = actor?.full_name || actor?.email || 'System / Automated'
                const actorRole = actor?.role || '—'
                const actionPres = resolveActionPresentation(log.action, log.entity_type, log.metadata || {})
                const resTitle = resolveResourceTitle(log.entity_type, log.entity_id, log.metadata || {}, postsMap)
                const resPath = getResourcePath(log.entity_type, log.entity_id)

                return (
                  <tr key={log.id} onClick={() => setSelectedLog(log)}>
                    <td>
                      <div className="actor-info-cell">
                        <span className="actor-name">{actorName}</span>
                        <span className="actor-email">{actor?.email || '—'} {actorRole !== '—' && `(${formatRole(actorRole)})`}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`action-type-pill ${actionPres.category}`}>
                        {actionPres.icon}
                        {actionPres.label}
                      </span>
                    </td>
                    <td>
                      {resPath ? (
                        <Link
                          to={resPath}
                          onClick={e => e.stopPropagation()}
                          style={{ fontWeight: 700, color: 'var(--dash-gold-dark)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <span>{resTitle}</span>
                          <ExternalLink size={12} />
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--dash-navy)' }}>{resTitle}</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--dash-text-secondary)', fontSize: '13px' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="asset-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedLog(log)
                        }}
                      >
                        <Info size={13} />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="activity-pagination-footer">
              <span>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={14} />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedLog && (
        <ActivityDetailsModal
          log={selectedLog}
          actor={profilesMap.get(selectedLog.user_id)}
          postsMap={postsMap}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  )
}

function ActivityDetailsModal({ log, actor, postsMap, onClose }) {
  const navigate = useNavigate()

  const actorName = actor?.full_name || actor?.email || 'System / Automated'
  const actionPres = resolveActionPresentation(log.action, log.entity_type, log.metadata || {})
  const resTitle = resolveResourceTitle(log.entity_type, log.entity_id, log.metadata || {}, postsMap)

  const safeMetadata = useMemo(() => {
    if (!log.metadata || typeof log.metadata !== 'object') return []
    const forbidden = ['token', 'password', 'secret', 'auth', 'hash', 'credential']
    return Object.entries(log.metadata).filter(([key]) => {
      const lower = key.toLowerCase()
      return !forbidden.some(f => lower.includes(f))
    })
  }, [log.metadata])

  const getResourceLink = () => {
    if (!log.entity_id) return null
    if (log.entity_type === 'post' && postsMap.has(log.entity_id)) {
      return `/dashboard/posts/${log.entity_id}/edit`
    }
    if (log.entity_type === 'review_note') return `/dashboard/review`
    if (log.entity_type === 'category') return `/dashboard/categories`
    if (log.entity_type === 'media') return `/dashboard/media`
    return null
  }

  const resourceLink = getResourceLink()

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="activity-details-title">
      <div className="activity-modal">
        <div className="category-modal-header">
          <h2 id="activity-details-title">Activity Audit Details</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="activity-modal-body">
          <div className="activity-meta-grid">
            <div className="activity-meta-item">
              <label>Actor</label>
              <span>{actorName}</span>
            </div>
            <div className="activity-meta-item">
              <label>Actor Role</label>
              <span>{actor?.role ? formatRole(actor.role) : '—'}</span>
            </div>
            <div className="activity-meta-item">
              <label>Action Performed</label>
              <span style={{ fontWeight: 700 }}>{actionPres.label}</span>
            </div>
            <div className="activity-meta-item">
              <label>Exact Time</label>
              <span>{formatDate(log.created_at)}</span>
            </div>
            <div className="activity-meta-item" style={{ gridColumn: '1 / -1' }}>
              <label>Resource Target</label>
              <span>{resTitle} ({log.entity_type || 'General'})</span>
            </div>
          </div>

          {safeMetadata.length > 0 && (
            <div className="modal-section">
              <div className="modal-section-title">Audit Metadata Breakdown</div>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--dash-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {safeMetadata.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--dash-text-secondary)' }}>{k}:</span>
                    <span style={{ color: 'var(--dash-navy)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="category-modal-footer">
          {resourceLink && (
            <button
              type="button"
              className="category-modal-save-btn"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                onClose()
                navigate(resourceLink)
              }}
            >
              <ExternalLink size={14} />
              <span>View Resource</span>
            </button>
          )}
          <button type="button" className="category-modal-cancel-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
