import React, { useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { compressImage } from '../../utils/imageCompression'
import { Image as ImageIcon, Upload, X, AlertCircle } from 'lucide-react'

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
  const fileInputRef = useRef(null)

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clear previous errors
    setLocalError(null)

    // 1. Validate file type
    if (!file.type.startsWith('image/')) {
      setLocalError('Please select a valid image file.')
      return
    }

    setIsUploading(true)
    setUploadProgress(10) // Start compression

    try {
      // 2. Compress and convert to WebP client-side
      const compressedBlob = await compressImage(file)
      setUploadProgress(40) // Compression complete, starting upload

      // 3. Upload to Supabase Storage bucket 'content-images'
      const uniqueId = Math.random().toString(36).substring(2, 9)
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30)
      
      const fileName = `${Date.now()}-${sanitizedName || 'image'}-${uniqueId}.webp`
      const filePath = `${userId}/${fileName}`

      setUploadProgress(60)

      const { data, error: uploadErr } = await supabase.storage
        .from('content-images')
        .upload(filePath, compressedBlob, {
          contentType: 'image/webp',
          cacheControl: '2592000', // 30 days
          upsert: false
        })

      if (uploadErr) {
        throw uploadErr
      }

      setUploadProgress(90)

      // 4. Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('content-images')
        .getPublicUrl(filePath)

      setUploadProgress(100)
      onChangeUrl(publicUrl)
    } catch (err) {
      console.error('Upload failed:', err)
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
                <span>Click to upload</span> or drag and drop
              </p>
              <p className="uploader-hint">
                WebP, PNG, JPG accepted (Large images resized to 1600px)
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

      {/* Local Component Errors */}
      {localError && (
        <div className="validation-error-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={14} />
          <span>{localError}</span>
        </div>
      )}

      {/* RHF External URL Error */}
      {errorUrl && !localError && (
        <div className="validation-error-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={14} />
          <span>{errorUrl.message}</span>
        </div>
      )}

      {/* Alternative Text Field (Required if image exists) */}
      {url && (
        <div className={`editor-form-group ${errorAlt ? 'has-error' : ''}`}>
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
    </div>
  )
}
