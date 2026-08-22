import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatRole } from '../utils/formatRole'
import {
  User,
  Shield,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Calendar,
  Check,
  X,
  UserCheck,
  Users
} from 'lucide-react'
import '../styles/dashboard.css'
import '../styles/profile.css'

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

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile, signOut } = useAuth()

  // Profile Edit State
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [profileNotification, setProfileNotification] = useState(null)

  // Supervisor / Contributor Assignments State
  const [supervisorInfo, setSupervisorInfo] = useState(null)
  const [teamContributors, setTeamContributors] = useState([])
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordNotification, setPasswordNotification] = useState(null)

  // Global Sign-Out Modal
  const [isSigningOutAll, setIsSigningOutAll] = useState(false)

  // Initialize editable fields from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile])

  // Load Supervisor or Contributor Assignments
  const loadAssignments = useCallback(async () => {
    if (!profile) return
    setIsLoadingAssignments(true)

    try {
      const role = (profile.role || '').toLowerCase()

      if (role === 'contributor') {
        const { data: ass } = await supabase
          .from('supervisor_assignments')
          .select('supervisor_id')
          .eq('contributor_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()

        if (ass?.supervisor_id) {
          const { data: sup } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', ass.supervisor_id)
            .single()

          setSupervisorInfo(sup || null)
        }
      } else if (role === 'supervisor') {
        const { data: assList } = await supabase
          .from('supervisor_assignments')
          .select('contributor_id')
          .eq('supervisor_id', profile.id)
          .eq('is_active', true)

        if (assList && assList.length > 0) {
          const cIds = assList.map(a => a.contributor_id)
          const { data: contribs } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', cIds)

          setTeamContributors(contribs || [])
        }
      }
    } catch (err) {
      console.warn('[ProfilePage] Load assignments error:', err)
    } finally {
      setIsLoadingAssignments(false)
    }
  }, [profile])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  // Unsaved changes check
  const hasProfileChanges = profile && (
    fullName.trim() !== (profile.full_name || '') ||
    avatarUrl.trim() !== (profile.avatar_url || '')
  )

  // Password Requirements Validation
  const pwdReqs = {
    length: newPassword.length >= 10,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
    match: newPassword.length > 0 && newPassword === confirmPassword
  }

  const isPasswordValid = Object.values(pwdReqs).every(Boolean)

  // ─────────────────────────────────────────────────────────────────────────
  // Handle Profile Update
  // Payload contains ONLY: full_name, avatar_url, updated_at
  // ─────────────────────────────────────────────────────────────────────────
  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    if (!profile || !hasProfileChanges) return
    setIsUpdatingProfile(true)
    setProfileNotification(null)

    try {
      const updatePayload = {
        full_name: fullName.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString()
      }

      const { error: err } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id)

      if (err) throw err

      await refreshProfile()
      setProfileNotification({ type: 'success', message: 'Profile updated successfully.' })
    } catch (err) {
      console.error('[ProfilePage] Profile update error:', err)
      setProfileNotification({ type: 'error', message: err.message || 'Failed to update profile.' })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handle Password Change
  // Reauthenticates current password first before updating
  // ─────────────────────────────────────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (!isPasswordValid) return
    setIsChangingPassword(true)
    setPasswordNotification(null)

    try {
      // 1. Reauthenticate user with current credentials
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      })

      if (reauthErr) {
        setPasswordNotification({ type: 'error', message: 'Current password is incorrect.' })
        setIsChangingPassword(false)
        return
      }

      // 2. Update password
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateErr) throw updateErr

      // 3. Success reset
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordNotification({ type: 'success', message: 'Password changed successfully.' })
    } catch (err) {
      console.error('[ProfilePage] Password change error:', err)
      setPasswordNotification({ type: 'error', message: err.message || 'Failed to change password.' })
    } finally {
      setIsChangingPassword(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handle Sessions (Sign Out Local / Global)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSignOutLocal = async () => {
    await signOut()
    navigate('/login')
  }

  const handleSignOutGlobal = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' })
      navigate('/login')
    } catch (err) {
      console.error('Global signout error:', err)
      navigate('/login')
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2)
    : user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <div className="dashboard-content-wrapper">
      <div className="activity-page-header">
        <div>
          <h2>Profile & Account Settings</h2>
          <p>Manage your profile details, password security, and active sessions.</p>
        </div>
      </div>

      <div className="profile-page-grid">
        {/* Left Column: Read-Only Account Summary Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="profile-card">
            <div className="profile-card-header">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar-large">{initials}</div>
              )}
              <div className="profile-header-meta">
                <h3>{profile?.full_name || 'Anonymous User'}</h3>
                <p>{profile?.email}</p>
              </div>
            </div>

            <div className="profile-meta-list">
              <div className="profile-meta-row">
                <span className="profile-meta-label">System Role</span>
                <span className="profile-meta-value">{formatRole(profile?.role)}</span>
              </div>

              <div className="profile-meta-row">
                <span className="profile-meta-label">Account Status</span>
                <span className="action-type-pill category" style={{ fontSize: '11px' }}>
                  <UserCheck size={12} />
                  Active
                </span>
              </div>

              {/* Contributor's Supervisor */}
              {profile?.role === 'contributor' && (
                <div className="profile-meta-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                  <span className="profile-meta-label">Assigned Supervisor</span>
                  <span className="profile-meta-value">
                    {isLoadingAssignments
                      ? 'Loading...'
                      : supervisorInfo
                      ? `${supervisorInfo.full_name} (${supervisorInfo.email})`
                      : 'Unassigned'}
                  </span>
                </div>
              )}

              {/* Supervisor's Team */}
              {profile?.role === 'supervisor' && (
                <div className="profile-meta-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <span className="profile-meta-label">Assigned Contributors ({teamContributors.length})</span>
                  {teamContributors.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--dash-text-secondary)' }}>No assigned contributors</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {teamContributors.map(c => (
                        <span key={c.id} className="action-type-pill post" style={{ fontSize: '11px' }}>
                          {c.full_name || c.email}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="profile-meta-row">
                <span className="profile-meta-label">Account Created</span>
                <span className="profile-meta-value">{formatDate(profile?.created_at)}</span>
              </div>

              <div className="profile-meta-row">
                <span className="profile-meta-label">Last Profile Update</span>
                <span className="profile-meta-value">{formatDate(profile?.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Session & Security Card */}
          <div className="profile-card">
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--dash-navy)' }}>Session & Devices</h3>
            <p style={{ fontSize: '13px', color: 'var(--dash-text-secondary)', marginTop: '-12px' }}>
              Control your active logins across mobile and web devices.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                className="asset-action-btn"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                onClick={handleSignOutLocal}
              >
                <LogOut size={14} />
                <span>Sign Out of This Device</span>
              </button>

              <button
                type="button"
                className="asset-action-btn delete"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                onClick={() => setIsSigningOutAll(true)}
              >
                <Shield size={14} />
                <span>Sign Out of All Devices</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Profile Details & Change Password Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Editable Profile Information Form */}
          <div className="profile-card">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--dash-navy)' }}>Personal Information</h3>

            {profileNotification && (
              <div className={`users-notification ${profileNotification.type}`}>
                {profileNotification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{profileNotification.message}</span>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label htmlFor="profile-full-name">Full Name</label>
                <input
                  id="profile-full-name"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full display name..."
                  required
                  disabled={isUpdatingProfile}
                />
              </div>

              <div className="modal-form-group">
                <label htmlFor="profile-avatar-url">Profile Photo URL (Optional)</label>
                <input
                  id="profile-avatar-url"
                  type="url"
                  value={avatarUrl}
                  onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  disabled={isUpdatingProfile}
                />
              </div>

              {/* Read-Only Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="modal-form-group">
                  <label>Email (Read-only)</label>
                  <input type="text" value={profile?.email || ''} disabled readOnly style={{ opacity: 0.6 }} />
                </div>
                <div className="modal-form-group">
                  <label>Role (Read-only)</label>
                  <input type="text" value={formatRole(profile?.role)} disabled readOnly style={{ opacity: 0.6 }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="category-modal-save-btn"
                  disabled={!hasProfileChanges || isUpdatingProfile}
                >
                  {isUpdatingProfile ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="profile-card">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--dash-navy)' }}>Security & Password</h3>

            {passwordNotification && (
              <div className={`users-notification ${passwordNotification.type}`}>
                {passwordNotification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{passwordNotification.message}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label htmlFor="current-password">Current Password</label>
                <div className="input-with-icon-wrapper">
                  <input
                    id="current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password..."
                    required
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="modal-form-group">
                <label htmlFor="new-password">New Password</label>
                <div className="input-with-icon-wrapper">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password..."
                    required
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label="Toggle new password visibility"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="modal-form-group">
                <label htmlFor="confirm-password">Confirm New Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password..."
                  required
                  disabled={isChangingPassword}
                />
              </div>

              {/* Password Requirements Guidance */}
              <div className="password-strength-container">
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--dash-text-secondary)' }}>
                  Password Requirements
                </label>
                <div className="password-requirements-list">
                  <div className={`password-req-item ${pwdReqs.length ? 'valid' : ''}`}>
                    {pwdReqs.length ? <Check size={12} /> : <X size={12} />}
                    <span>Minimum 10 characters</span>
                  </div>
                  <div className={`password-req-item ${pwdReqs.uppercase ? 'valid' : ''}`}>
                    {pwdReqs.uppercase ? <Check size={12} /> : <X size={12} />}
                    <span>Uppercase letter (A-Z)</span>
                  </div>
                  <div className={`password-req-item ${pwdReqs.lowercase ? 'valid' : ''}`}>
                    {pwdReqs.lowercase ? <Check size={12} /> : <X size={12} />}
                    <span>Lowercase letter (a-z)</span>
                  </div>
                  <div className={`password-req-item ${pwdReqs.number ? 'valid' : ''}`}>
                    {pwdReqs.number ? <Check size={12} /> : <X size={12} />}
                    <span>Number (0-9)</span>
                  </div>
                  <div className={`password-req-item ${pwdReqs.special ? 'valid' : ''}`}>
                    {pwdReqs.special ? <Check size={12} /> : <X size={12} />}
                    <span>Special character (!@#$)</span>
                  </div>
                  <div className={`password-req-item ${pwdReqs.match ? 'valid' : ''}`}>
                    {pwdReqs.match ? <Check size={12} /> : <X size={12} />}
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="category-modal-save-btn"
                  disabled={!isPasswordValid || isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Global Sign Out Confirmation Modal */}
      {isSigningOutAll && (
        <div className="delete-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="signout-confirm-title">
          <div className="delete-confirm-modal">
            <div className="delete-confirm-title">
              <Shield size={20} style={{ color: '#DC2626' }} />
              <span id="signout-confirm-title">Sign Out of All Devices</span>
            </div>

            <p className="delete-confirm-message">
              Are you sure you want to invalidate all active session tokens and sign out across every browser and device?
            </p>

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="category-modal-cancel-btn"
                onClick={() => setIsSigningOutAll(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="category-modal-save-btn"
                style={{ backgroundColor: '#DC2626', color: '#ffffff' }}
                onClick={handleSignOutGlobal}
              >
                <LogOut size={14} />
                <span>Confirm Sign Out All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
