import React, { useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { compressImage } from '../../utils/imageCompression'
import MediaPickerModal from '../media/MediaPickerModal'
import { Image as ImageIcon, Upload, X, AlertCircle, FolderKanban } from 'lucide-react'

export default function FeaturedImageUploader({
  url,
  onChangeUrl,
  alt,
  onChangeAlt,
  userId,
  errorUrl,
  errorAlt
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [localError, setLocalError] = useState(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLocalError(null)

    if (!file.type.startsWith('image/')) {
      setLocalError('Please select a valid image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setLocalError('File size exceeds the 5MB limit.')
      return
    }

    setIsUploading(true)
    setUploadProgress(10)

    let filePath = null

    try {
      // Compress and resize
      const { blob, width, height } = await compressImage(file)
      setUploadProgress(40)

      const uniqueId = Math.random().toString(36).substring(2, 9)
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30)
      
      const fileName = `${Date.now()}-${sanitizedName || 'image'}-${uniqueId}.webp`
      filePath = `${userId || 'anonymous'}/${fileName}`

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

      // Metadata insert
      try {
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
            uploaded_by: userId || null
          })

        if (metaErr && metaErr.code !== '42P01') {
          console.warn('[AASU CMS] Media metadata insert error:', metaErr)
        }
      } catch (mErr) {
        console.warn('[AASU CMS] Media metadata insert exception:', mErr)
      }

      setUploadProgress(100)
      onChangeUrl(publicUrl)
    } catch (err) {
      console.error('Upload failed:', err)
      // Cleanup storage object if metadata insertion or upload step failed
      if (filePath) {
        try {
          await supabase.storage.from('content-images').remove([filePath])
        } catch (cleanErr) {
          console.warn('Storage cleanup failed:', cleanErr)
        }
      }
      setLocalError(err.message || 'Image upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleRemoveImage = () => {
    onChangeUrl('')
    onChangeAlt('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const triggerSelect = () => {
    if (fileInputRef.current && !isUploading) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="image-uploader-container">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
        disabled={isUploading}
      />

      {/* Choose from Media Library Button */}
      {!url && (
        <button
          type="button"
          className="edit-action-btn"
          style={{ width: '100%', justifyContent: 'center', marginBottom: '10px' }}
          onClick={() => setIsPickerOpen(true)}
          disabled={isUploading}
        >
          <FolderKanban size={14} />
          <span>Choose from Media Library</span>
        </button>
      )}

      {/* Main Upload Drop Area */}
      {!url ? (
        <div
          className={`image-uploader-card ${errorUrl ? 'has-error' : ''}`}
          onClick={triggerSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              triggerSelect()
            }
          }}
          aria-label="Upload featured image"
        >
          {isUploading ? (
            <div className="upload-progress-overlay">
              <div className="progress-spinner"></div>
              <p>Compressing & Uploading... ({uploadProgress}%)</p>
            </div>
          ) : (
            <div className="uploader-empty-state">
              <Upload size={32} />
              <p className="uploader-text">
                <span>Click to upload new image</span>
              </p>
              <p className="uploader-hint">
                WebP, PNG, JPG accepted (Max 5MB, resized to 1600px)
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Image Preview State */
        <div className="uploader-preview-wrapper">
          <img src={url} alt="Featured preview" className="uploader-preview-img" />
          
          <button
            type="button"
            className="remove-image-btn"
            onClick={handleRemoveImage}
            aria-label="Remove image"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Component Errors */}
      {localError && (
        <div className="validation-error-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          <AlertCircle size={14} />
          <span>{localError}</span>
        </div>
      )}

      {errorUrl && !localError && (
        <div className="validation-error-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          <AlertCircle size={14} />
          <span>{errorUrl.message}</span>
        </div>
      )}

      {/* Alternative Text Field */}
      {url && (
        <div className={`editor-form-group ${errorAlt ? 'has-error' : ''}`} style={{ marginTop: '12px' }}>
          <label htmlFor="featured_image_alt">Image Alt Text (Required)</label>
          <input
            id="featured_image_alt"
            type="text"
            value={alt}
            onChange={(e) => onChangeAlt(e.target.value)}
            placeholder="Describe the image content for screen readers..."
            required
            disabled={isUploading}
          />
          <p className="uploader-hint" style={{ marginTop: '2px' }}>
            Alt text is essential for accessibility and search engine ranking.
          </p>
          {errorAlt && (
            <div className="validation-error-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{errorAlt.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Media Library Picker Modal */}
      {isPickerOpen && (
        <MediaPickerModal
          onClose={() => setIsPickerOpen(false)}
          onSelect={({ url: selectedUrl, alt: selectedAlt }) => {
            onChangeUrl(selectedUrl)
            if (selectedAlt && !alt) {
              onChangeAlt(selectedAlt)
            }
          }}
        />
      )}
    </div>
  )
}
