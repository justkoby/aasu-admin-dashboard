import React, { useState, useEffect, useCallback, useMemo } from 'react'
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

const logSupabaseError = (operation, error) => {
  if (!error) return
  console.error(`[AASU User Management] Supabase Error during ${operation}:`, {
    operation,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    errorObj: error
  })
}

const getInitials = (name, email) => {
  if (name && name.trim()) return name.trim().charAt(0).toUpperCase()
  if (email && email.trim()) return email.trim().charAt(0).toUpperCase()
  return '?'
}

const resolveDisplayName = (p) => {
  if (!p) return 'Unknown user'
  if (p.full_name && p.full_name.trim()) return p.full_name.trim()
  if (p.email && p.email.trim()) return p.email.trim()
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
  { value: 'super_admin', label: 'Super Admin' },
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
  const [assignments, setAssignments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignmentWarning, setAssignmentWarning] = useState(null)

  // ── Filters ──
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // ── Modal ──
  const [managingUser, setManagingUser] = useState(null)
  const [modalRole, setModalRole] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Load users and assignments separately
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setAssignmentWarning(null)

    let profilesData = []
    let profilesError = null

    // Query 1: Fetch profiles
    try {
      let res = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, avatar_url, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (res.error) {
        logSupabaseError('profiles.select (full columns)', res.error)
        // Fallback to essential columns in case schema differs
        res = await supabase
          .from('profiles')
          .select('id, full_name, email, role, is_active, created_at')
          .order('created_at', { ascending: false })
      }

      if (res.error) {
        logSupabaseError('profiles.select (fallback)', res.error)
        profilesError = res.error
      } else {
        profilesData = res.data || []
      }
    } catch (err) {
      logSupabaseError('profiles.select (exception)', err)
      profilesError = err
    }

    // Critical failure: if profiles query fails completely, show error state
    if (profilesError) {
      setError(profilesError)
      setIsLoading(false)
      return
    }

    // Query 2: Fetch supervisor_assignments
    let assignmentsData = []
    try {
      let res = await supabase
        .from('supervisor_assignments')
        .select('id, supervisor_id, contributor_id, assigned_by, is_active, assigned_at, updated_at')

      if (res.error) {
        logSupabaseError('supervisor_assignments.select (full columns)', res.error)
        // Fallback query with essential columns
        res = await supabase
          .from('supervisor_assignments')
          .select('id, supervisor_id, contributor_id, is_active, created_at')
          .eq('is_active', true)
      }

      if (res.error) {
        logSupabaseError('supervisor_assignments.select (fallback)', res.error)
        setAssignmentWarning('Supervisor assignments could not be loaded. Displaying user profiles.')
      } else {
        assignmentsData = res.data || []
      }
    } catch (err) {
      logSupabaseError('supervisor_assignments.select (exception)', err)
      setAssignmentWarning('Supervisor assignments could not be loaded. Displaying user profiles.')
    }

    setUsers(profilesData)
    setAssignments(assignmentsData.filter(a => a.is_active !== false))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────────────────────────
  // JavaScript Map Indexing
  // ─────────────────────────────────────────────────────────────────────────

  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach(u => map.set(u.id, u))
    return map
  }, [users])

  const supervisors = useMemo(() => {
    return users.filter(u => u.role === 'supervisor')
  }, [users])

  const supervisorToContributorsMap = useMemo(() => {
    const map = new Map()
    assignments.forEach(a => {
      if (a.is_active === false) return
      const supId = a.supervisor_id
      const contrib = userMap.get(a.contributor_id)
      if (supId && contrib) {
        if (!map.has(supId)) map.set(supId, [])
        map.get(supId).push(contrib)
      }
    })
    return map
  }, [assignments, userMap])

  const contributorToSupervisorMap = useMemo(() => {
    const map = new Map()
    assignments.forEach(a => {
      if (a.is_active === false) return
      const contribId = a.contributor_id
      const supervisor = userMap.get(a.supervisor_id)
      if (contribId && supervisor) {
        map.set(contribId, supervisor)
      }
    })
    return map
  }, [assignments, userMap])

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered display list
  // ─────────────────────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
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
  }, [users, searchTerm, roleFilter, statusFilter])

  // ─────────────────────────────────────────────────────────────────────────
  // Table Cell Rendering
  // ─────────────────────────────────────────────────────────────────────────

  const getAssignmentRow = (user) => {
    if (user.role === 'contributor') {
      const sup = contributorToSupervisorMap.get(user.id)
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
      const interns = supervisorToContributorsMap.get(user.id) || []
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
  // Modal handlers & Actions
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

  /**
   * Save role change directly to Supabase and update local state upon DB confirmation.
   */
  const handleSaveRole = async () => {
    if (!managingUser || isOwnAccount) return
    if (modalRole === managingUser.role) return

    const confirmed = window.confirm(
      `Change ${resolveDisplayName(managingUser)}'s role from "${formatRole(managingUser.role)}" to "${formatRole(modalRole)}"? This will affect their dashboard access immediately.`
    )
    if (!confirmed) return

    setIsSaving(true)
    setNotification(null)

    try {
      // 1. Execute Supabase update as specified
      const { data, error } = await supabase
        .from('profiles')
        .update({
          role: modalRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', managingUser.id)
        .select('id, full_name, email, role, is_active, created_at, updated_at')
        .single()

      if (error) {
        console.error('[User Management Error] Failed to update user role in Supabase:', {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          managedUserId: managingUser.id,
          selectedRole: modalRole
        })
        setNotification({
          type: 'error',
          message: `Failed to persist role change to Supabase: ${error.message || 'Database update error.'}`
        })
        setIsSaving(false)
        return
      }

      if (!data) {
        console.error('[User Management Error] No database row returned after role update:', {
          managedUserId: managingUser.id,
          selectedRole: modalRole
        })
        setNotification({
          type: 'error',
          message: 'Failed to update role. No data returned from Supabase.'
        })
        setIsSaving(false)
        return
      }

      // 2. Handle side-effects (assignment deactivation) if supervisor/contributor roles changed
      if (managingUser.role === 'supervisor' && data.role !== 'supervisor') {
        const { error: deactErr } = await supabase
          .from('supervisor_assignments')
          .update({ is_active: false })
          .eq('supervisor_id', managingUser.id)
        if (deactErr) {
          logSupabaseError('supervisor_assignments.update (supervisor demotion)', deactErr)
        }
      }
      if (managingUser.role === 'contributor' && data.role !== 'contributor') {
        const { error: deactErr } = await supabase
          .from('supervisor_assignments')
          .update({ is_active: false })
          .eq('contributor_id', managingUser.id)
        if (deactErr) {
          logSupabaseError('supervisor_assignments.update (contributor role change)', deactErr)
        }
      }

      // 3. Update local state with confirmed database row
      setUsers(prevUsers =>
        prevUsers.map(u => (u.id === data.id ? { ...u, ...data } : u))
      )
      setManagingUser(data)
      setModalRole(data.role)

      setNotification({
        type: 'success',
        message: `Role successfully updated to ${formatRole(data.role)} in Supabase.`
      })

      // 4. Refetch full profiles list from database
      await loadData()
    } catch (err) {
      console.error('[User Management Error] Exception during handleSaveRole:', {
        code: err?.code ?? null,
        message: err?.message ?? null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
        managedUserId: managingUser?.id ?? null,
        selectedRole: modalRole,
        exception: err
      })
      setNotification({
        type: 'error',
        message: `An unexpected error occurred: ${err.message || 'Save failed'}`
      })
    } finally {
      setIsSaving(false)
    }
  }

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
    setNotification(null)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          is_active: !managingUser.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', managingUser.id)
        .select('id, full_name, email, role, is_active, created_at, updated_at')
        .single()

      if (error) {
        console.error('[User Management Error] Failed to update user active status in Supabase:', {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          managedUserId: managingUser.id,
          targetIsActive: !managingUser.is_active
        })
        setNotification({
          type: 'error',
          message: `Failed to update status in Supabase: ${error.message || 'Database update error.'}`
        })
        setIsSaving(false)
        return
      }

      if (data) {
        setUsers(prev => prev.map(u => (u.id === data.id ? { ...u, ...data } : u)))
        setManagingUser(data)
      }

      setNotification({
        type: 'success',
        message: willDeactivate ? 'Account deactivated.' : 'Account reactivated.'
      })
      await loadData()
    } catch (err) {
      console.error('[User Management Error] Exception during handleToggleActive:', err)
      setNotification({ type: 'error', message: 'Failed to update account status.' })
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Assign a supervisor to a contributor with mandatory logging and insert/update logic.
   */
  const handleAssignSupervisor = async (supervisorId) => {
    // 1. Requirement 4: MUST log on the very first line before any validation!
    const authenticatedUserId = authProfile?.id
    console.log('[AASU CMS] Assign Supervisor clicked', {
      selectedSupervisorId: supervisorId,
      contributorId: managingUser?.id,
      authenticatedUserId: authenticatedUserId
    })

    // 2. Requirement 5: If empty, do not silently return — show message
    if (!supervisorId) {
      setNotification({ type: 'error', message: 'Please select a supervisor.' })
      return false
    }

    if (!managingUser) {
      setNotification({ type: 'error', message: 'No contributor selected.' })
      return false
    }

    const targetContributor = managingUser

    // 3. Validations
    const selectedSupervisor = userMap.get(supervisorId)
    if (!selectedSupervisor) {
      console.error('[AASU CMS] Selected supervisor not found in userMap:', supervisorId)
      setNotification({ type: 'error', message: 'Selected supervisor does not exist.' })
      return false
    }

    if (selectedSupervisor.role !== 'supervisor') {
      console.error('[AASU CMS] Selected user role is not supervisor:', selectedSupervisor)
      setNotification({ type: 'error', message: 'Selected user is not a supervisor.' })
      return false
    }

    if (targetContributor.role !== 'contributor') {
      console.error('[AASU CMS] Target user role is not contributor:', targetContributor)
      setNotification({ type: 'error', message: 'Only contributors can be assigned a supervisor.' })
      return false
    }

    if (supervisorId === targetContributor.id) {
      setNotification({ type: 'error', message: 'Supervisor ID cannot match contributor ID.' })
      return false
    }

    setIsSaving(true)
    setNotification(null)

    try {
      // Deactivate any existing active assignment for this contributor with a different supervisor
      const { error: deactErr } = await supabase
        .from('supervisor_assignments')
        .update({ is_active: false })
        .eq('contributor_id', targetContributor.id)
        .neq('supervisor_id', supervisorId)
        .eq('is_active', true)

      if (deactErr) {
        logSupabaseError('supervisor_assignments.update (deactivate existing)', deactErr)
      }

      // Check for an existing relationship using supervisor_id + contributor_id
      const { data: existingRow, error: checkErr } = await supabase
        .from('supervisor_assignments')
        .select('id, supervisor_id, contributor_id, is_active')
        .eq('supervisor_id', supervisorId)
        .eq('contributor_id', targetContributor.id)
        .maybeSingle()

      if (checkErr) {
        console.error('[AASU CMS] Check existing relationship error:', checkErr)
      }

      let data = null
      let error = null

      if (existingRow) {
        console.log('[AASU CMS] Updating existing supervisor assignment row:', existingRow.id)
        const res = await supabase
          .from('supervisor_assignments')
          .update({
            is_active: true,
            assigned_by: authenticatedUserId
          })
          .eq('id', existingRow.id)
          .select()
          .single()

        data = res.data
        error = res.error
      } else {
        const assignmentPayload = {
          supervisor_id: supervisorId,
          contributor_id: targetContributor.id,
          assigned_by: authenticatedUserId,
          is_active: true
        }

        console.log('[AASU CMS] Creating supervisor assignment', assignmentPayload)

        const res = await supabase
          .from('supervisor_assignments')
          .insert(assignmentPayload)
          .select()
          .single()

        data = res.data
        error = res.error
      }

      console.log('[AASU CMS] Assignment response', { data, error })

      if (error || !data) {
        console.error('[AASU CMS] Supervisor assignment failed:', {
          code: error?.code ?? null,
          message: error?.message ?? null,
          details: error?.details ?? null,
          hint: error?.hint ?? null,
          supervisor_id: supervisorId,
          contributor_id: targetContributor.id,
          authenticatedUserId: authenticatedUserId
        })

        setNotification({
          type: 'error',
          message: `Failed to assign supervisor: ${error?.message || 'Database insert/update error.'}`
        })
        return false
      }

      // On success: refetch data and show success message
      await loadData()

      setNotification({
        type: 'success',
        message: 'Supervisor assigned successfully'
      })
      return true
    } catch (err) {
      console.error('[AASU CMS] Exception during supervisor assignment:', {
        code: err?.code ?? null,
        message: err?.message ?? null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
        supervisor_id: supervisorId,
        contributor_id: targetContributor?.id,
        authenticatedUserId: authenticatedUserId,
        exception: err
      })
      setNotification({
        type: 'error',
        message: `Failed to assign supervisor: ${err.message || 'An unexpected error occurred.'}`
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveAssignment = async (contributorId, supervisorId) => {
    const targetSupId = supervisorId || managingUser?.id
    const contributor = userMap.get(contributorId)
    const confirmed = window.confirm(
      `Remove ${resolveDisplayName(contributor)} from this supervisor? The assignment history will be preserved.`
    )
    if (!confirmed) return

    setIsSaving(true)
    setNotification(null)

    try {
      const { data, error } = await supabase
        .from('supervisor_assignments')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('supervisor_id', targetSupId)
        .eq('contributor_id', contributorId)
        .eq('is_active', true)
        .select('id, supervisor_id, contributor_id, is_active')

      if (error) {
        logSupabaseError('supervisor_assignments.update (remove)', error)
        console.error('[Supervisor Assignment Remove Error]', {
          operation: 'remove_assignment',
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          supervisor_id: targetSupId,
          contributor_id: contributorId,
          authenticated_user_id: authProfile?.id
        })
        setNotification({
          type: 'error',
          message: `Failed to remove assignment: ${error.message || 'Database update error.'}`
        })
        return
      }

      setNotification({ type: 'success', message: 'Assignment removed successfully.' })
      await loadData()
    } catch (err) {
      console.error('[Supervisor Assignment Remove Exception]', err)
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

      {/* Non-blocking Assignment Warning Banner */}
      {assignmentWarning && (
        <div className="users-notification error" style={{ marginBottom: '16px' }}>
          <AlertTriangle size={16} />
          <span>{assignmentWarning}</span>
        </div>
      )}

      {/* Top-level Notification */}
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
                        <span className="user-full-name">{u.full_name || u.email || 'Unknown user'}</span>
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
                      <span className="user-full-name">{u.full_name || u.email || 'Unknown user'}</span>
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
          user={userMap.get(managingUser.id) || managingUser}
          supervisors={supervisors}
          userMap={userMap}
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
          supervisorToContributorsMap={supervisorToContributorsMap}
          contributorToSupervisorMap={contributorToSupervisorMap}
        />
      )}
    </div>
  )
}

// ─── Manage User Modal Component ─────────────────────────────────────────────

function ManageUserModal({
  user,
  supervisors,
  userMap,
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
  supervisorToContributorsMap,
  contributorToSupervisorMap
}) {
  const [selectedNewSupervisorId, setSelectedNewSupervisorId] = useState('')

  const assignedSupervisor = user.role === 'contributor' ? contributorToSupervisorMap.get(user.id) : null
  const assignedContributors = user.role === 'supervisor' ? (supervisorToContributorsMap.get(user.id) || []) : []

  // Supervisors available for assignment (not the current one already assigned)
  const availableSupervisors = supervisors.filter(s => s.is_active && s.id !== assignedSupervisor?.id)

  const isRoleChanged = modalRole !== user.role

  const handleAssign = async (e) => {
    if (e) e.preventDefault()
    if (!selectedNewSupervisorId) {
      onAssignSupervisor('')
      return
    }
    const success = await onAssignSupervisor(selectedNewSupervisorId)
    if (success) {
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
            <div className="modal-user-name">{resolveDisplayName(user)}</div>
            <div className="modal-user-email">{user.email || '—'}</div>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Visible notification / error inside modal */}
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
                  type="button"
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
                  <button
                    type="button"
                    className="modal-save-btn"
                    style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                    onClick={onSaveRole}
                    disabled={isSaving || !isRoleChanged}
                  >
                    <CheckCircle2 size={14} />
                    {isSaving ? 'Saving...' : 'Save Role Change'}
                  </button>
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
                      {assignedSupervisor.email || '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="modal-assignment-remove-btn"
                    onClick={() => onRemoveAssignment(user.id, assignedSupervisor.id)}
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
                      onChange={(event) => {
                        setSelectedNewSupervisorId(event.target.value)
                      }}
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
                      type="button"
                      className="modal-save-btn"
                      onClick={handleAssign}
                      disabled={isSaving}
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
                        <div className="modal-assignment-email">{c.email || '—'}</div>
                      </div>
                      <button
                        type="button"
                        className="modal-assignment-remove-btn"
                        onClick={() => onRemoveAssignment(c.id, user.id)}
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
          <button type="button" className="modal-cancel-btn" onClick={onClose} disabled={isSaving}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
