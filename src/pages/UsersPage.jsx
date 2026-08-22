import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatRole } from '../utils/formatRole'
import {
  Users,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Shield,
  UserCheck,
  UserX,
  ChevronDown
} from 'lucide-react'
import '../styles/dashboard.css'
import '../styles/users.css'

// ─── Helpers ────────────────────────────────────────────────────────────────

const getInitials = (name, email) => {
  if (name) return name.charAt(0).toUpperCase()
  if (email) return email.charAt(0).toUpperCase()
  return '?'
}

const resolveDisplayName = (p) => {
  if (p?.full_name) return p.full_name
  if (p?.email) return p.email
  return 'Unknown user'
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch {
    return '—'
  }
}

const ROLE_OPTIONS = [
  { value: 'contributor', label: 'Contributor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'communications_admin', label: 'Communications Admin' },
]

// ─── Role Badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const cls = {
    super_admin: 'super-admin',
    communications_admin: 'communications-admin',
    supervisor: 'supervisor',
    contributor: 'contributor',
  }[role] || 'contributor'

  return (
    <span className={`role-badge ${cls}`}>
      {formatRole(role)}
    </span>
  )
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({ isActive }) {
  return (
    <span className={`status-pill ${isActive ? 'active' : 'inactive'}`}>
      <span className="status-pill-dot" />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UsersPage() {
  const { profile: authProfile } = useAuth()

  // ── Data ──
  const [users, setUsers] = useState([])
  const [supervisors, setSupervisors] = useState([]) // profiles with role=supervisor
  const [assignments, setAssignments] = useState([]) // all active supervisor_assignments
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Filters ──
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // ── Modal ──
  const [managingUser, setManagingUser] = useState(null) // profile being managed
  const [modalRole, setModalRole] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState(null) // { type, message }

  // ─────────────────────────────────────────────────────────────────────────
  // Load users, supervisors, and assignments
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [profilesRes, assignmentsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, is_active, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('supervisor_assignments')
          .select('id, supervisor_id, contributor_id, is_active, created_at')
          .eq('is_active', true)
      ])

      if (profilesRes.error) throw profilesRes.error
      if (assignmentsRes.error) throw assignmentsRes.error

      const allProfiles = profilesRes.data || []
      setUsers(allProfiles)
      setSupervisors(allProfiles.filter(p => p.role === 'supervisor'))
      setAssignments(assignmentsRes.data || [])
    } catch (err) {
      console.error('Error loading users:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered display list
  // ─────────────────────────────────────────────────────────────────────────

  const filteredUsers = users.filter(u => {
    const term = searchTerm.trim().toLowerCase()
    if (term) {
      const matchName = (u.full_name || '').toLowerCase().includes(term)
      const matchEmail = (u.email || '').toLowerCase().includes(term)
      if (!matchName && !matchEmail) return false
    }
    if (roleFilter && u.role !== roleFilter) return false
    if (statusFilter === 'active' && !u.is_active) return false
    if (statusFilter === 'inactive' && u.is_active) return false
    return true
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Assignment helpers
  // ─────────────────────────────────────────────────────────────────────────

  const getSupervisorForContributor = (contributorId) => {
    const a = assignments.find(a => a.contributor_id === contributorId)
    if (!a) return null
    return users.find(u => u.id === a.supervisor_id) || null
  }

  const getContributorsForSupervisor = (supervisorId) => {
    const assigned = assignments
      .filter(a => a.supervisor_id === supervisorId)
      .map(a => users.find(u => u.id === a.contributor_id))
      .filter(Boolean)
    return assigned
  }

  const getAssignmentRow = (user) => {
    if (user.role === 'contributor') {
      const sup = getSupervisorForContributor(user.id)
      return (
        <div className="assignment-info">
          <span className="assignment-label">Supervisor</span>
          <span className={`assignment-value ${!sup ? 'unassigned' : ''}`}>
            {sup ? resolveDisplayName(sup) : 'Unassigned'}
          </span>
        </div>
      )
    }
    if (user.role === 'supervisor') {
      const interns = getContributorsForSupervisor(user.id)
      return (
        <div className="assignment-info">
          <span className="assignment-label">Interns</span>
          <span className="assignment-value">
            {interns.length > 0 ? `${interns.length} assigned` : 'None assigned'}
          </span>
        </div>
      )
    }
    return <span style={{ color: 'var(--dash-text-muted)', fontSize: '13px' }}>—</span>
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Open manage modal
  // ─────────────────────────────────────────────────────────────────────────

  const openManage = (user) => {
    setManagingUser(user)
    setModalRole(user.role)
    setNotification(null)
  }

  const closeManage = () => {
    setManagingUser(null)
    setNotification(null)
  }

  const isOwnAccount = managingUser?.id === authProfile?.id

  // ─────────────────────────────────────────────────────────────────────────
  // Save: role change
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveRole = async () => {
    if (!managingUser || isOwnAccount) return
    if (modalRole === managingUser.role) return

    const confirmed = window.confirm(
      `Change ${resolveDisplayName(managingUser)}'s role from "${formatRole(managingUser.role)}" to "${formatRole(modalRole)}"? This will affect their dashboard access immediately.`
    )
    if (!confirmed) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: modalRole })
        .eq('id', managingUser.id)
      if (error) throw error

      // If a supervisor is demoted, deactivate their assignments
      if (managingUser.role === 'supervisor' && modalRole !== 'supervisor') {
        await supabase
          .from('supervisor_assignments')
          .update({ is_active: false })
          .eq('supervisor_id', managingUser.id)
      }
      // If a contributor's role changes, deactivate any supervisor assignment
      if (managingUser.role === 'contributor' && modalRole !== 'contributor') {
        await supabase
          .from('supervisor_assignments')
          .update({ is_active: false })
          .eq('contributor_id', managingUser.id)
      }

      setNotification({ type: 'success', message: `Role updated to ${formatRole(modalRole)}.` })
      await loadData()
      // Refresh managingUser from fresh data
      const { data: fresh } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, created_at')
        .eq('id', managingUser.id)
        .single()
      if (fresh) setManagingUser(fresh)
    } catch (err) {
      console.error('Role update failed:', err)
      setNotification({ type: 'error', message: 'Failed to update role. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Save: activate / deactivate
  // ─────────────────────────────────────────────────────────────────────────

  const handleToggleActive = async () => {
    if (!managingUser || isOwnAccount) return

    const willDeactivate = managingUser.is_active
    const confirmed = window.confirm(
      willDeactivate
        ? `Deactivate ${resolveDisplayName(managingUser)}'s account? They will no longer be able to sign in.`
        : `Reactivate ${resolveDisplayName(managingUser)}'s account? They will regain access immediately.`
    )
    if (!confirmed) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !managingUser.is_active })
        .eq('id', managingUser.id)
      if (error) throw error

      setNotification({
        type: 'success',
        message: willDeactivate ? 'Account deactivated.' : 'Account reactivated.'
      })
      await loadData()
      const { data: fresh } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, created_at')
        .eq('id', managingUser.id)
        .single()
      if (fresh) setManagingUser(fresh)
    } catch (err) {
      console.error('Active toggle failed:', err)
      setNotification({ type: 'error', message: 'Failed to update account status.' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Assign supervisor to contributor
  // ─────────────────────────────────────────────────────────────────────────

  const handleAssignSupervisor = async (supervisorId) => {
    if (!managingUser || managingUser.role !== 'contributor' || !supervisorId) return

    const sup = users.find(u => u.id === supervisorId)
    const confirmed = window.confirm(
      `Assign ${resolveDisplayName(managingUser)} to supervisor ${resolveDisplayName(sup)}?`
    )
    if (!confirmed) return

    setIsSaving(true)
    try {
      // Deactivate any existing active assignment for this contributor
      await supabase
        .from('supervisor_assignments')
        .update({ is_active: false })
        .eq('contributor_id', managingUser.id)
        .eq('is_active', true)

      // Insert new assignment
      const { error } = await supabase
        .from('supervisor_assignments')
        .insert({
          supervisor_id: supervisorId,
          contributor_id: managingUser.id,
          is_active: true
        })
      if (error) throw error

      setNotification({ type: 'success', message: `Assigned to ${resolveDisplayName(sup)}.` })
      await loadData()
    } catch (err) {
      console.error('Assignment failed:', err)
      setNotification({ type: 'error', message: 'Failed to create assignment. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remove assignment
  // ─────────────────────────────────────────────────────────────────────────

  const handleRemoveAssignment = async (contributorId) => {
    const contributor = users.find(u => u.id === contributorId)
    const confirmed = window.confirm(
      `Remove ${resolveDisplayName(contributor)} from this supervisor? The assignment history will be preserved.`
    )
    if (!confirmed) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('supervisor_assignments')
        .update({ is_active: false })
        .eq('supervisor_id', managingUser.id)
        .eq('contributor_id', contributorId)
        .eq('is_active', true)
      if (error) throw error

      setNotification({ type: 'success', message: 'Assignment removed.' })
      await loadData()
    } catch (err) {
      console.error('Remove assignment failed:', err)
      setNotification({ type: 'error', message: 'Failed to remove assignment.' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: '#DC2626' }} />
        <h3>Failed to Load Users</h3>
        <p>An error occurred while loading profiles. Please try again.</p>
        <button className="retry-btn" onClick={loadData}>
          <RefreshCw size={16} />
          <span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      {/* Page Header */}
      <div className="users-page-header">
        <div>
          <h2>User Management</h2>
          <p>Manage roles, assignments, and account access for all AASU CMS users.</p>
        </div>
      </div>

      {/* Top-level notification */}
      {notification && !managingUser && (
        <div className={`users-notification ${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="users-filter-bar">
        <div className="filter-group search">
          <label htmlFor="user-search">Search</label>
          <input
            id="user-search"
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Name or email..."
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="user-role-filter">Role</label>
          <select
            id="user-role-filter"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="communications_admin">Comms Admin</option>
            <option value="supervisor">Supervisor</option>
            <option value="contributor">Contributor</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="user-status-filter">Status</label>
          <select
            id="user-status-filter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && (
        <p className="users-summary-strip">
          Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> users
        </p>
      )}

      {/* Users Table */}
      {isLoading ? (
        <div className="users-card-container" style={{ padding: '24px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div className="skeleton skeleton-circle" />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '40%', height: '16px', marginBottom: '8px' }} />
                <div className="skeleton skeleton-text" style={{ width: '60%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="users-card-container">
          <div className="empty-state">
            <Users size={48} className="empty-state-icon" />
            <h3>No users found</h3>
            <p>
              {searchTerm || roleFilter || statusFilter
                ? 'No users match your current filters. Clear them and try again.'
                : 'No user profiles exist in the database.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="users-card-container">
          {/* Desktop Table */}
          <table className="users-list-table" aria-label="CMS Users">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Assignment</th>
                <th>Joined</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-name-cell">
                      <div className="user-avatar">
                        {getInitials(u.full_name, u.email)}
                      </div>
                      <div className="user-name-text">
                        <span className="user-full-name">{u.full_name || '—'}</span>
                        <span className="user-email">{u.email || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><StatusPill isActive={u.is_active} /></td>
                  <td>{getAssignmentRow(u)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--dash-text-secondary)', fontSize: '13px' }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td>
                    <button
                      className="manage-user-btn"
                      onClick={() => openManage(u)}
                      aria-label={`Manage ${resolveDisplayName(u)}`}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile Cards */}
          <div className="users-mobile-grid">
            {filteredUsers.map(u => (
              <div className="user-mobile-card" key={u.id}>
                <div className="user-mobile-header">
                  <div className="user-mobile-name-block">
                    <div className="user-avatar">
                      {getInitials(u.full_name, u.email)}
                    </div>
                    <div className="user-name-text">
                      <span className="user-full-name">{u.full_name || u.email || '—'}</span>
                      <span className="user-email">{u.email}</span>
                    </div>
                  </div>
                  <StatusPill isActive={u.is_active} />
                </div>
                <div className="user-mobile-details">
                  <div className="user-mobile-detail-item">
                    <span className="user-mobile-detail-label">Role</span>
                    <span className="user-mobile-detail-value"><RoleBadge role={u.role} /></span>
                  </div>
                  <div className="user-mobile-detail-item">
                    <span className="user-mobile-detail-label">Joined</span>
                    <span className="user-mobile-detail-value">{formatDate(u.created_at)}</span>
                  </div>
                  <div className="user-mobile-detail-item" style={{ gridColumn: '1/-1' }}>
                    <span className="user-mobile-detail-label">Assignment</span>
                    <span className="user-mobile-detail-value">{getAssignmentRow(u)}</span>
                  </div>
                </div>
                <div className="user-mobile-actions">
                  <button className="manage-user-btn" onClick={() => openManage(u)}>
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manage User Modal ── */}
      {managingUser && (
        <ManageUserModal
          user={managingUser}
          allSupervisors={supervisors}
          assignments={assignments}
          allUsers={users}
          modalRole={modalRole}
          setModalRole={setModalRole}
          isOwnAccount={isOwnAccount}
          isSaving={isSaving}
          notification={notification}
          onClose={closeManage}
          onSaveRole={handleSaveRole}
          onToggleActive={handleToggleActive}
          onAssignSupervisor={handleAssignSupervisor}
          onRemoveAssignment={handleRemoveAssignment}
          resolveDisplayName={resolveDisplayName}
          getContributorsForSupervisor={getContributorsForSupervisor}
          getSupervisorForContributor={getSupervisorForContributor}
        />
      )}
    </div>
  )
}

// ─── Manage User Modal Component ─────────────────────────────────────────────

function ManageUserModal({
  user,
  allSupervisors,
  assignments,
  allUsers,
  modalRole,
  setModalRole,
  isOwnAccount,
  isSaving,
  notification,
  onClose,
  onSaveRole,
  onToggleActive,
  onAssignSupervisor,
  onRemoveAssignment,
  resolveDisplayName,
  getContributorsForSupervisor,
  getSupervisorForContributor,
}) {
  const [selectedNewSupervisorId, setSelectedNewSupervisorId] = useState('')

  const assignedSupervisor = user.role === 'contributor' ? getSupervisorForContributor(user.id) : null
  const assignedContributors = user.role === 'supervisor' ? getContributorsForSupervisor(user.id) : []

  // Supervisors available for assignment (not the current one already assigned)
  const availableSupervisors = allSupervisors.filter(s => s.is_active && s.id !== assignedSupervisor?.id)

  const getInitials = (name, email) => {
    if (name) return name.charAt(0).toUpperCase()
    if (email) return email.charAt(0).toUpperCase()
    return '?'
  }

  const handleAssign = () => {
    if (selectedNewSupervisorId) {
      onAssignSupervisor(selectedNewSupervisorId)
      setSelectedNewSupervisorId('')
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="manage-modal-title">
      <div className="manage-user-modal">
        {/* Header */}
        <div className="manage-user-modal-header">
          <h2 id="manage-modal-title">Manage User</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal" disabled={isSaving}>
            <X size={18} />
          </button>
        </div>

        {/* User Profile Block */}
        <div className="modal-user-profile">
          <div className="modal-user-avatar">
            {getInitials(user.full_name, user.email)}
          </div>
          <div>
            <div className="modal-user-name">{user.full_name || user.email || 'Unknown user'}</div>
            <div className="modal-user-email">{user.email}</div>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Notification inside modal */}
          {notification && (
            <div className={`users-notification ${notification.type}`} style={{ marginBottom: 0 }}>
              {notification.type === 'success'
                ? <CheckCircle2 size={16} />
                : <AlertTriangle size={16} />
              }
              <span>{notification.message}</span>
            </div>
          )}

          {/* ── Account Status ── */}
          <div className="modal-section">
            <div className="modal-section-title">Account Status</div>
            <div className="status-toggle-row">
              <div className="status-toggle-info">
                <span className="status-toggle-label">
                  {user.is_active ? 'Account Active' : 'Account Inactive'}
                </span>
                <span className="status-toggle-sublabel">
                  {user.is_active
                    ? 'User can sign in and use the CMS.'
                    : 'User is blocked from signing in.'}
                </span>
              </div>
              {isOwnAccount ? (
                <span className="own-account-warning">
                  <Shield size={12} />
                  Cannot modify own account
                </span>
              ) : (
                <button
                  className={`modal-deactivate-btn ${user.is_active ? 'deactivate' : 'activate'}`}
                  onClick={onToggleActive}
                  disabled={isSaving}
                >
                  {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                  {user.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          </div>

          {/* ── Role ── */}
          {user.role !== 'super_admin' && (
            <div className="modal-section">
              <div className="modal-section-title">Role</div>
              {isOwnAccount ? (
                <p className="modal-form-hint" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={12} />
                  You cannot change your own role.
                </p>
              ) : (
                <div className="modal-form-group">
                  <label htmlFor="modal-role-select">Assigned Role</label>
                  <select
                    id="modal-role-select"
                    value={modalRole}
                    onChange={e => setModalRole(e.target.value)}
                    disabled={isSaving}
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="modal-form-hint">
                    Changing the role updates their dashboard access immediately.
                  </p>
                  {modalRole !== user.role && (
                    <button
                      className="modal-save-btn"
                      style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                      onClick={onSaveRole}
                      disabled={isSaving}
                    >
                      <CheckCircle2 size={14} />
                      {isSaving ? 'Saving...' : 'Save Role Change'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Contributor: Assigned Supervisor ── */}
          {user.role === 'contributor' && (
            <div className="modal-section">
              <div className="modal-section-title">Supervisor Assignment</div>

              {assignedSupervisor ? (
                <div className="modal-assignment-item">
                  <div>
                    <div className="modal-assignment-name">
                      {resolveDisplayName(assignedSupervisor)}
                    </div>
                    <div className="modal-assignment-email">
                      {assignedSupervisor.email}
                    </div>
                  </div>
                  <button
                    className="modal-assignment-remove-btn"
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Remove ${resolveDisplayName(user)} from supervisor ${resolveDisplayName(assignedSupervisor)}?`
                      )
                      if (!confirmed) return
                      // Deactivate assignment from the contributor side
                      supabase
                        .from('supervisor_assignments')
                        .update({ is_active: false })
                        .eq('contributor_id', user.id)
                        .eq('supervisor_id', assignedSupervisor.id)
                        .eq('is_active', true)
                        .then(({ error }) => {
                          if (error) {
                            console.error('Remove assignment failed:', error)
                          }
                          // Reload data via parent
                          onRemoveAssignment && onRemoveAssignment(user.id)
                        })
                    }}
                    title="Remove assignment"
                    disabled={isSaving}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <p className="modal-assignment-empty">No supervisor assigned yet.</p>
              )}

              {/* Reassign / assign dropdown */}
              {availableSupervisors.length > 0 && (
                <div className="modal-form-group" style={{ marginTop: '10px' }}>
                  <label htmlFor="assign-supervisor-select">
                    {assignedSupervisor ? 'Reassign Supervisor' : 'Assign Supervisor'}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      id="assign-supervisor-select"
                      value={selectedNewSupervisorId}
                      onChange={e => setSelectedNewSupervisorId(e.target.value)}
                      disabled={isSaving}
                      style={{ flex: 1 }}
                    >
                      <option value="">Select a supervisor...</option>
                      {availableSupervisors.map(s => (
                        <option key={s.id} value={s.id}>
                          {resolveDisplayName(s)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="modal-save-btn"
                      onClick={handleAssign}
                      disabled={!selectedNewSupervisorId || isSaving}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {isSaving ? 'Saving...' : 'Assign'}
                    </button>
                  </div>
                </div>
              )}
              {availableSupervisors.length === 0 && !assignedSupervisor && (
                <p className="modal-form-hint">
                  No active supervisors available. Create a supervisor account first.
                </p>
              )}
            </div>
          )}

          {/* ── Supervisor: Assigned Contributors ── */}
          {user.role === 'supervisor' && (
            <div className="modal-section">
              <div className="modal-section-title">
                Assigned Contributors ({assignedContributors.length})
              </div>
              <div className="modal-assignment-list">
                {assignedContributors.length === 0 ? (
                  <p className="modal-assignment-empty">No contributors assigned to this supervisor.</p>
                ) : (
                  assignedContributors.map(c => (
                    <div className="modal-assignment-item" key={c.id}>
                      <div>
                        <div className="modal-assignment-name">{resolveDisplayName(c)}</div>
                        <div className="modal-assignment-email">{c.email}</div>
                      </div>
                      <button
                        className="modal-assignment-remove-btn"
                        onClick={() => onRemoveAssignment(c.id)}
                        title={`Remove ${resolveDisplayName(c)}`}
                        disabled={isSaving}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose} disabled={isSaving}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
