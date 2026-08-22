import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { formatBytes } from '../../utils/imageCompression'
import { Search, X, CheckCircle2, Image as ImageIcon, RefreshCw } from 'lucide-react'
import '../../styles/media.css'

export default function MediaPickerModal({ onClose, onSelect }) {
  const { user, profile } = useAuth()
  const userRole = (profile?.role || '').toLowerCase()
  const isAdminRole = userRole === 'super_admin' || userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'

  const [assets, setAssets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAsset, setSelectedAsset] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadAssets() {
      setIsLoading(true)
      try {
        let query = supabase
          .from('media_assets')
          .select('id, storage_path, public_url, original_filename, file_type, file_size, width, height, alt_text, created_at, uploaded_by')
          .order('created_at', { ascending: false })

        // Role-based query filtering for frontend resilience
        if (!isAdminRole && !isSupervisor && user?.id) {
          query = query.eq('uploaded_by', user.id)
        }

        const { data, error } = await query

        if (error) {
          console.warn('[MediaPickerModal] Primary query warning:', error)
          // Fallback query if schema or RLS requires broader select
          const fallback = await supabase
            .from('media_assets')
            .select('*')
            .order('created_at', { ascending: false })
          if (!fallback.error && isMounted) {
            setAssets(fallback.data || [])
          }
        } else if (isMounted) {
          setAssets(data || [])
        }
      } catch (err) {
        console.error('[MediaPickerModal] Error loading assets:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadAssets()
    return () => {
      isMounted = false
    }
  }, [isAdminRole, isSupervisor, user?.id])

  const filteredAssets = assets.filter(a => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true
    return (
      (a.original_filename || '').toLowerCase().includes(term) ||
      (a.alt_text || '').toLowerCase().includes(term) ||
      (a.caption || '').toLowerCase().includes(term)
    )
  })

  const handleConfirmSelect = () => {
    if (!selectedAsset) return
    onSelect({
      url: selectedAsset.public_url,
      alt: selectedAsset.alt_text || ''
    })
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
      <div className="media-picker-modal">
        {/* Header */}
        <div className="category-modal-header">
          <h2 id="media-picker-title">Choose Image from Media Library</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar Search */}
        <div style={{ padding: '16px 20px 0 20px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search filename or alt text..."
              className="media-search-input"
            />
          </div>
        </div>

        {/* Grid Content */}
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--dash-text-secondary)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
            <p>Loading media library assets...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--dash-text-secondary)' }}>
            <ImageIcon size={40} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <p>No media assets found in library.</p>
          </div>
        ) : (
          <div className="media-picker-grid">
            {filteredAssets.map(asset => {
              const isSelected = selectedAsset?.id === asset.id
              return (
                <div
                  key={asset.id}
                  className={`picker-asset-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedAsset(asset)}
                  title={`${asset.original_filename} (${formatBytes(asset.file_size)})`}
                >
                  <img
                    src={asset.public_url}
                    alt={asset.alt_text || asset.original_filename}
                    className="picker-asset-img"
                  />
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      backgroundColor: 'var(--dash-navy)',
                      color: '#ffffff',
                      borderRadius: '50%',
                      padding: '2px',
                      display: 'flex'
                    }}>
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Selected asset hint */}
        {selectedAsset && (
          <div style={{ padding: '8px 20px', fontSize: '13px', color: 'var(--dash-text-secondary)', backgroundColor: 'var(--dash-bg-subtle)' }}>
            Selected: <strong>{selectedAsset.original_filename}</strong> {selectedAsset.width && `(${selectedAsset.width} × ${selectedAsset.height} px)`}
          </div>
        )}

        {/* Footer */}
        <div className="category-modal-footer">
          <button type="button" className="category-modal-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="category-modal-save-btn"
            onClick={handleConfirmSelect}
            disabled={!selectedAsset}
          >
            <CheckCircle2 size={16} />
            <span>Use Selected Image</span>
          </button>
        </div>
      </div>
    </div>
  )
}
