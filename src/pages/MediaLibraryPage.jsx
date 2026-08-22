import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { compressImage, formatBytes } from '../utils/imageCompression'
import {
  Image as ImageIcon,
  Upload,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Copy,
  Edit2,
  Trash2,
  Grid,
  List as ListIcon,
  ExternalLink,
  User,
  AlertCircle
} from 'lucide-react'
import '../styles/dashboard.css'
import '../styles/media.css'

const logSupabaseError = (operation, error, extra = {}) => {
  if (!error) return
  console.error(`[AASU Media Library] Supabase Error during ${operation}:`, {
    operation,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    extra,
    rawError: error
  })
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

export default function MediaLibraryPage() {
  const { user, profile } = useAuth()
  const userRole = (profile?.role || '').toLowerCase()
  const isAdminRole = userRole === 'super_admin' || userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'

  // Data state
  const [assets, setAssets] = useState([])
  const [profilesMap, setProfilesMap] = useState(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Display
  const [viewMode, setViewMode] = useState('grid')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Upload State
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)

  // Modals & Notifications
  const [selectedAsset, setSelectedAsset] = useState(null) // Details modal
  const [assetToDelete, setAssetToDelete] = useState(null) // Confirmation modal
  const [isDeletingAsset, setIsDeletingAsset] = useState(false)
  const [deleteModalError, setDeleteModalError] = useState(null)

  const [notification, setNotification] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Load Media Assets & Profiles
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
      
      const pMap = new Map()
      if (profData) {
        profData.forEach(p => pMap.set(p.id, p))
      }
      setProfilesMap(pMap)

      let query = supabase
        .from('media_assets')
        .select('*')
        .order('created_at', { ascending: false })

      if (!isAdminRole && !isSupervisor && user?.id) {
        query = query.eq('uploaded_by', user.id)
      }

      const { data, error: mediaErr } = await query

      if (mediaErr) {
        logSupabaseError('media_assets.select', mediaErr)
        if (mediaErr.code === '42P01') {
          setError({
            message: 'The media_assets database table has not been initialized yet. Please run migration 002_create_media_assets.sql.'
          })
          setIsLoading(false)
          return
        }
        throw mediaErr
      }

      setAssets(data || [])
    } catch (err) {
      logSupabaseError('loadData (exception)', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [isAdminRole, isSupervisor, user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────────────────────────
  // Upload Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setNotification(null)

    if (!file.type.startsWith('image/')) {
      setNotification({ type: 'error', message: 'Please select a valid image file (JPG, PNG, WebP).' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'File size exceeds the 5MB limit.' })
      return
    }

    setIsUploading(true)
    setUploadProgress(10)
    let filePath = null

    try {
      const { blob, width, height } = await compressImage(file)
      setUploadProgress(40)

      const uniqueId = Math.random().toString(36).substring(2, 9)
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30)

      const fileName = `${Date.now()}-${sanitizedName || 'asset'}-${uniqueId}.webp`
      filePath = `${user?.id || 'anonymous'}/${fileName}`

      setUploadProgress(60)

      const { error: uploadErr } = await supabase.storage
        .from('content-images')
        .upload(filePath, blob, {
          contentType: 'image/webp',
          cacheControl: '2592000',
          upsert: false
        })

      if (uploadErr) throw uploadErr

      setUploadProgress(85)

      const { data: { publicUrl } } = supabase.storage
        .from('content-images')
        .getPublicUrl(filePath)

      const { error: metaErr } = await supabase
        .from('media_assets')
        .insert({
          storage_path: filePath,
          public_url: publicUrl,
          original_filename: file.name,
          file_type: 'image/webp',
          mime_type: 'image/webp',
          file_size: blob.size,
          width,
          height,
          uploaded_by: user?.id || null
        })

      if (metaErr) {
        logSupabaseError('media_assets.insert', metaErr, { filePath })
        await supabase.storage.from('content-images').remove([filePath])
        throw new Error(`Failed to save image metadata: ${metaErr.message}`)
      }

      setUploadProgress(100)
      setNotification({ type: 'success', message: `Image "${file.name}" uploaded successfully.` })
      await loadData()
    } catch (err) {
      logSupabaseError('handleUploadFile (exception)', err)
      setNotification({ type: 'error', message: err.message || 'Image upload failed.' })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete Flow: Initiate & Confirm
  // ─────────────────────────────────────────────────────────────────────────

  const handleInitiateDelete = (asset) => {
    console.log('[AASU CMS Media] Delete Asset clicked', {
      assetId: asset.id,
      storage_path: asset.storage_path,
      public_url: asset.public_url,
      authenticatedUserId: user?.id,
      uploaderId: asset.uploaded_by
    })

    setDeleteModalError(null)
    setAssetToDelete(asset)
  }

  const handleConfirmDelete = async () => {
    if (!assetToDelete) return
    setIsDeletingAsset(true)
    setDeleteModalError(null)

    try {
      // 1. Posts dependency check
      console.log('[AASU CMS Media] Running posts usage check', {
        assetId: assetToDelete.id,
        public_url: assetToDelete.public_url,
        storage_path: assetToDelete.storage_path
      })

      const { data: postRefs, error: postErr } = await supabase
        .from('posts')
        .select('id, title')
        .or(`featured_image_url.eq.${assetToDelete.public_url},featured_image_url.ilike.%${assetToDelete.storage_path}%`)

      console.log('[AASU CMS Media] Posts usage check result', {
        data: postRefs,
        error: postErr ? {
          code: postErr.code,
          message: postErr.message,
          details: postErr.details,
          hint: postErr.hint,
          raw: postErr
        } : null
      })

      if (postErr) {
        logSupabaseError('posts usage check', postErr)
      }

      if (postRefs && postRefs.length > 0) {
        setDeleteModalError(
          `Cannot delete asset because it is currently used as the featured image for ${postRefs.length} post(s): ${postRefs.map(p => `"${p.title}"`).join(', ')}.`
        )
        setIsDeletingAsset(false)
        return
      }

      // 2. Storage object deletion
      let cleanStoragePath = assetToDelete.storage_path || ''
      if (cleanStoragePath.includes('/content-images/')) {
        cleanStoragePath = cleanStoragePath.split('/content-images/')[1]
      }

      console.log('[AASU CMS Media] Executing storage deletion', { cleanStoragePath })

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('content-images')
        .remove([cleanStoragePath])

      console.log('[AASU CMS Media] Storage objects deletion result', {
        data: storageData,
        error: storageErr ? {
          code: storageErr.code,
          message: storageErr.message,
          details: storageErr.details,
          hint: storageErr.hint,
          raw: storageErr
        } : null
      })

      if (storageErr) {
        logSupabaseError('storage.remove', storageErr)
        setDeleteModalError(`Storage object deletion failed: ${storageErr.message || 'Unknown error'}`)
        setIsDeletingAsset(false)
        return
      }

      // 3. Metadata row deletion
      console.log('[AASU CMS Media] Executing media_assets row deletion', { id: assetToDelete.id })

      const { data: metaDelData, error: metaDelErr } = await supabase
        .from('media_assets')
        .delete()
        .eq('id', assetToDelete.id)
        .select('id')
        .single()

      console.log('[AASU CMS Media] media_assets deletion result', {
        data: metaDelData,
        error: metaDelErr ? {
          code: metaDelErr.code,
          message: metaDelErr.message,
          details: metaDelErr.details,
          hint: metaDelErr.hint,
          raw: metaDelErr
        } : null
      })

      if (metaDelErr) {
        logSupabaseError('media_assets.delete', metaDelErr)
        setDeleteModalError(`Database metadata deletion failed (RLS policy may have blocked this operation): ${metaDelErr.message}`)
        setIsDeletingAsset(false)
        return
      }

      if (!metaDelData || !metaDelData.id) {
        setDeleteModalError('Database metadata deletion returned no row. RLS policy may have blocked this delete operation.')
        setIsDeletingAsset(false)
        return
      }

      // Success sequence
      setAssetToDelete(null)
      setSelectedAsset(null)
      setIsDeletingAsset(false)
      setNotification({ type: 'success', message: 'Asset deleted successfully.' })
      await loadData()
    } catch (err) {
      console.error('[AASU CMS Media] Unexpected error during asset deletion:', err)
      setDeleteModalError(`Deletion failed: ${err.message || 'An unexpected error occurred.'}`)
      setIsDeletingAsset(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update Details Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleUpdateDetails = async (assetId, newAltText, newCaption) => {
    setNotification(null)

    try {
      const { data, error: updateErr } = await supabase
        .from('media_assets')
        .update({
          alt_text: newAltText || null,
          caption: newCaption || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', assetId)
        .select()
        .single()

      if (updateErr) {
        logSupabaseError('media_assets.update', updateErr, { id: assetId })
        setNotification({ type: 'error', message: `Failed to update details: ${updateErr.message}` })
        return false
      }

      setNotification({ type: 'success', message: 'Asset details updated successfully.' })
      setSelectedAsset(data)
      await loadData()
      return true
    } catch (err) {
      logSupabaseError('handleUpdateDetails (exception)', err)
      setNotification({ type: 'error', message: 'Failed to update asset details.' })
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Sync Storage Action
  // ─────────────────────────────────────────────────────────────────────────

  const handleSyncStorage = async () => {
    if (!isAdminRole) return
    setIsSyncing(true)
    setNotification(null)

    try {
      const { data: storageFiles, error: listErr } = await supabase.storage
        .from('content-images')
        .list('', { limit: 1000 })

      if (listErr) throw listErr

      const { data: existingRecords } = await supabase
        .from('media_assets')
        .select('storage_path')

      const registeredPaths = new Set((existingRecords || []).map(r => r.storage_path))

      let registeredCount = 0

      for (const item of (storageFiles || [])) {
        if (!item.name || registeredPaths.has(item.name)) continue

        const { data: { publicUrl } } = supabase.storage
          .from('content-images')
          .getPublicUrl(item.name)

        const { error: insErr } = await supabase
          .from('media_assets')
          .insert({
            storage_path: item.name,
            public_url: publicUrl,
            original_filename: item.name,
            file_type: 'image/webp',
            mime_type: 'image/webp',
            file_size: item.metadata?.size || 0,
            uploaded_by: user?.id || null
          })

        if (!insErr) registeredCount++
      }

      setNotification({
        type: 'success',
        message: registeredCount > 0
          ? `Successfully synchronized and registered ${registeredCount} existing file(s) from Storage.`
          : 'Storage files are already fully synchronized.'
      })
      await loadData()
    } catch (err) {
      logSupabaseError('handleSyncStorage (exception)', err)
      setNotification({ type: 'error', message: 'Storage sync failed.' })
    } finally {
      setIsSyncing(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setNotification({ type: 'success', message: 'Public URL copied to clipboard!' })
  }

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const term = searchTerm.trim().toLowerCase()
      if (term) {
        const matchName = (asset.original_filename || '').toLowerCase().includes(term)
        const matchAlt = (asset.alt_text || '').toLowerCase().includes(term)
        const matchCap = (asset.caption || '').toLowerCase().includes(term)
        if (!matchName && !matchAlt && !matchCap) return false
      }
      if (typeFilter !== 'all' && asset.file_type !== typeFilter && asset.mime_type !== typeFilter) {
        return false
      }
      return true
    }).sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at)
      }
      if (sortBy === 'name') {
        return (a.original_filename || '').localeCompare(b.original_filename || '')
      }
      if (sortBy === 'size') {
        return (b.file_size || 0) - (a.file_size || 0)
      }
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [assets, searchTerm, typeFilter, sortBy])

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={48} className="error-state-icon" style={{ color: '#DC2626' }} />
        <h3>Failed to Load Media Library</h3>
        <p>{error.message || 'An error occurred while fetching media assets.'}</p>
        <button className="retry-btn" onClick={loadData}>
          <RefreshCw size={16} />
          <span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-content-wrapper">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadFile}
        accept="image/*"
        style={{ display: 'none' }}
        disabled={isUploading}
      />

      <div className="media-page-header">
        <div>
          <h2>Media Library</h2>
          <p>Manage, upload, and organize images and media assets for AASU publishing.</p>
        </div>
        <div className="media-header-actions">
          {isAdminRole && (
            <button
              type="button"
              className="sync-storage-btn"
              onClick={handleSyncStorage}
              disabled={isSyncing || isLoading}
            >
              <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Storage'}</span>
            </button>
          )}
          <button
            type="button"
            className="upload-asset-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isLoading}
          >
            <Upload size={16} />
            <span>Upload Asset</span>
          </button>
        </div>
      </div>

      {notification && !selectedAsset && !assetToDelete && (
        <div className={`users-notification ${notification.type}`} style={{ marginBottom: '20px' }}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      <div
        className="media-upload-dropzone"
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <div>
            <RefreshCw size={28} className="spin dropzone-icon" />
            <p>Compressing & Uploading Asset... ({uploadProgress}%)</p>
          </div>
        ) : (
          <div>
            <Upload size={28} className="dropzone-icon" />
            <p><strong>Click here to upload</strong> an image (JPG, PNG, WebP)</p>
            <p className="dropzone-subtext">Max original size 5MB · Auto-resized to 1600px max width</p>
          </div>
        )}
      </div>

      <div className="media-toolbar">
        <div className="media-toolbar-left">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search filename, alt text, or caption..."
            className="media-search-input"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="media-filter-select"
          >
            <option value="all">All File Types</option>
            <option value="image/webp">WebP</option>
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG / JPEG</option>
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="media-filter-select"
          >
            <option value="newest">Sort by Newest</option>
            <option value="oldest">Sort by Oldest</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>

        <div className="media-view-toggle">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <Grid size={16} />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <ListIcon size={16} />
          </button>
        </div>
      </div>

      {!isLoading && (
        <p className="categories-summary-strip" style={{ marginBottom: '16px' }}>
          Showing <strong>{filteredAssets.length}</strong> of <strong>{assets.length}</strong> assets
        </p>
      )}

      {isLoading ? (
        <div className="media-grid-container">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="media-asset-card" style={{ padding: '16px' }}>
              <div className="skeleton" style={{ height: '120px', borderRadius: '8px', marginBottom: '12px' }} />
              <div className="skeleton skeleton-text" style={{ width: '70%', height: '14px' }} />
            </div>
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="categories-card-container">
          <div className="empty-state">
            <ImageIcon size={48} className="empty-state-icon" />
            <h3>No media assets found</h3>
            <p>
              {searchTerm || typeFilter !== 'all'
                ? 'No media files match your filter criteria. Clear filters and try again.'
                : 'No media files uploaded yet. Click "Upload Asset" or drag an image above.'}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="media-grid-container">
          {filteredAssets.map(asset => {
            return (
              <div className="media-asset-card" key={asset.id}>
                <div
                  className="media-asset-thumb-wrapper"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <img
                    src={asset.public_url}
                    alt={asset.alt_text || asset.original_filename}
                    className="media-asset-thumb-img"
                  />
                </div>
                <div className="media-asset-card-info">
                  <span className="media-asset-filename" title={asset.original_filename}>
                    {asset.original_filename}
                  </span>
                  <div className="media-asset-meta-row">
                    <span>{formatBytes(asset.file_size)}</span>
                    <span>{asset.width ? `${asset.width}×${asset.height}` : '—'}</span>
                  </div>
                </div>
                <div className="media-asset-actions">
                  <button
                    type="button"
                    className="asset-action-btn"
                    onClick={() => copyToClipboard(asset.public_url)}
                    title="Copy Public URL"
                  >
                    <Copy size={12} />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    className="asset-action-btn"
                    onClick={() => setSelectedAsset(asset)}
                    title="View details & edit alt text"
                  >
                    <Edit2 size={12} />
                    <span>Details</span>
                  </button>
                  <button
                    type="button"
                    className="asset-action-btn delete"
                    onClick={() => handleInitiateDelete(asset)}
                    title="Delete asset"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="categories-card-container">
          <table className="categories-list-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Dimensions</th>
                <th>File Size</th>
                <th>Uploader</th>
                <th>Date</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => {
                const uploader = profilesMap.get(asset.uploaded_by)
                const uploaderName = uploader?.full_name || uploader?.email || 'System'
                return (
                  <tr key={asset.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img
                          src={asset.public_url}
                          alt={asset.alt_text || asset.original_filename}
                          style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                        <div className="category-name-block">
                          <span className="category-name-text">{asset.original_filename}</span>
                          {asset.alt_text && (
                            <span style={{ fontSize: '12px', color: 'var(--dash-text-secondary)' }}>
                              Alt: {asset.alt_text}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{asset.width ? `${asset.width} × ${asset.height} px` : '—'}</td>
                    <td>{formatBytes(asset.file_size)}</td>
                    <td>{uploaderName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                      {formatDate(asset.created_at)}
                    </td>
                    <td>
                      <div className="category-action-group">
                        <button
                          type="button"
                          className="asset-action-btn"
                          onClick={() => copyToClipboard(asset.public_url)}
                        >
                          <Copy size={12} />
                          <span>Copy URL</span>
                        </button>
                        <button
                          type="button"
                          className="asset-action-btn"
                          onClick={() => setSelectedAsset(asset)}
                        >
                          <Edit2 size={12} />
                          <span>Details</span>
                        </button>
                        <button
                          type="button"
                          className="asset-action-btn delete"
                          onClick={() => handleInitiateDelete(asset)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Asset Details & Edit Modal */}
      {selectedAsset && (
        <AssetDetailsModal
          asset={selectedAsset}
          uploader={profilesMap.get(selectedAsset.uploaded_by)}
          onClose={() => setSelectedAsset(null)}
          onUpdate={handleUpdateDetails}
          onDelete={() => handleInitiateDelete(selectedAsset)}
          onCopyUrl={copyToClipboard}
        />
      )}

      {/* Visible Delete Confirmation Modal */}
      {assetToDelete && (
        <div className="delete-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="delete-confirm-modal">
            <div className="delete-confirm-title">
              <AlertTriangle size={20} style={{ color: '#DC2626' }} />
              <span id="delete-confirm-title">Confirm Asset Deletion</span>
            </div>

            <p className="delete-confirm-message">
              Permanently delete <strong>{assetToDelete.original_filename}</strong>? This cannot be undone.
            </p>

            {deleteModalError && (
              <div className="validation-error-text" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '4px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{deleteModalError}</span>
              </div>
            )}

            <div className="delete-confirm-actions">
              <button
                type="button"
                className="category-modal-cancel-btn"
                onClick={() => setAssetToDelete(null)}
                disabled={isDeletingAsset}
              >
                Cancel
              </button>

              <button
                type="button"
                className="category-modal-save-btn"
                style={{ backgroundColor: '#DC2626', color: '#ffffff' }}
                onClick={handleConfirmDelete}
                disabled={isDeletingAsset}
              >
                {isDeletingAsset ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Deleting asset…</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Asset Details Modal Component ─────────────────────────────────────────────

function AssetDetailsModal({ asset, uploader, onClose, onUpdate, onDelete, onCopyUrl }) {
  const [altText, setAltText] = useState(asset.alt_text || '')
  const [caption, setCaption] = useState(asset.caption || '')
  const [isSaving, setIsSaving] = useState(false)

  const uploaderName = uploader?.full_name || uploader?.email || 'System / Unregistered'

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    await onUpdate(asset.id, altText, caption)
    setIsSaving(false)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="asset-details-title">
      <div className="media-details-modal">
        <div className="category-modal-header">
          <h2 id="asset-details-title">Asset Details</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="media-details-body">
          <div className="media-details-preview-panel">
            <img
              src={asset.public_url}
              alt={altText || asset.original_filename}
              className="media-details-preview-img"
            />
            <div className="media-url-copy-box">
              <input
                type="text"
                readOnly
                value={asset.public_url}
                className="media-url-copy-input"
              />
              <button
                type="button"
                className="asset-action-btn"
                onClick={() => onCopyUrl(asset.public_url)}
              >
                <Copy size={13} />
                <span>Copy</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="modal-form-group">
              <label>Original Filename</label>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dash-navy)' }}>
                {asset.original_filename}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="modal-form-group">
                <label>Dimensions</label>
                <span style={{ fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                  {asset.width ? `${asset.width} × ${asset.height} px` : '—'}
                </span>
              </div>
              <div className="modal-form-group">
                <label>File Size</label>
                <span style={{ fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                  {formatBytes(asset.file_size)}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="modal-form-group">
                <label>Uploader</label>
                <span style={{ fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                  {uploaderName}
                </span>
              </div>
              <div className="modal-form-group">
                <label>Upload Date</label>
                <span style={{ fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                  {formatDate(asset.created_at)}
                </span>
              </div>
            </div>

            <div className="modal-form-group">
              <label htmlFor="edit-alt-text">Alt Text (Accessibility & SEO)</label>
              <input
                id="edit-alt-text"
                type="text"
                value={altText}
                onChange={e => setAltText(e.target.value)}
                placeholder="Describe image content..."
                disabled={isSaving}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="edit-caption">Caption</label>
              <textarea
                id="edit-caption"
                rows="2"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Optional image caption..."
                disabled={isSaving}
              ></textarea>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <button
                type="button"
                className="asset-action-btn delete"
                onClick={onDelete}
                disabled={isSaving}
              >
                <Trash2 size={13} />
                <span>Delete Asset</span>
              </button>

              <button
                type="submit"
                className="category-modal-save-btn"
                disabled={isSaving}
              >
                <CheckCircle2 size={16} />
                <span>{isSaving ? 'Saving...' : 'Save Details'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
