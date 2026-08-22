import React, { useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { supabase } from "../../lib/supabaseClient"
import { compressImage, getImageDimensions } from "../../utils/imageCompression"
import MediaPickerModal from "../media/MediaPickerModal"
import { Image as ImageIcon, Plus, Upload, ArrowUp, ArrowDown, Trash2, Loader2 } from "lucide-react"
import "../../styles/posts.css"

export default function PostGalleryManager({ galleryImages = [], onChangeGalleryImages }) {
  const { user } = useAuth()
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const handleSelectFromPicker = (selected) => {
    const newImage = {
      id: "temp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      image_url: selected.url,
      storage_path: null,
      alt_text: selected.alt || "",
      caption: "",
      sort_order: galleryImages.length,
      media_asset_id: selected.id || null
    }
    onChangeGalleryImages([...galleryImages, newImage])
  }

  const handleDirectUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError(null)

    let filePath = null

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image size exceeds 5MB limit.")
      }

      const dimensions = await getImageDimensions(file)
      const { blob, width, height } = await compressImage(file)

      const uniqueId = Math.random().toString(36).substring(2, 9)
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 30)
      
      const fileName = `${Date.now()}-${sanitizedName || "gallery"}-${uniqueId}.webp`
      filePath = `${user?.id || "anonymous"}/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from("content-images")
        .upload(filePath, blob, {
          contentType: "image/webp",
          cacheControl: "2592000",
          upsert: false
        })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from("content-images")
        .getPublicUrl(filePath)

      let assetId = null
      try {
        const { data: assetData, error: assetErr } = await supabase
          .from("media_assets")
          .insert({
            storage_path: filePath,
            public_url: publicUrl,
            original_filename: file.name,
            file_type: "image/webp",
            mime_type: "image/webp",
            file_size: blob.size,
            width: dimensions.width || width,
            height: dimensions.height || height,
            alt_text: "",
            uploaded_by: user?.id || null
          })
          .select("id")
          .maybeSingle()

        if (!assetErr && assetData) {
          assetId = assetData.id
        }
      } catch (mErr) {
        console.warn("Media asset insert warning:", mErr)
      }

      const newImage = {
        id: "temp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        image_url: publicUrl,
        storage_path: filePath,
        alt_text: "",
        caption: "",
        sort_order: galleryImages.length,
        media_asset_id: assetId
      }

      onChangeGalleryImages([...galleryImages, newImage])
    } catch (err) {
      console.error("[PostGalleryManager Upload Error]", err)
      if (filePath) {
        try {
          await supabase.storage.from("content-images").remove([filePath])
        } catch (cErr) {
          console.warn("Storage cleanup failed:", cErr)
        }
      }
      setUploadError(err.message || "Failed to upload image.")
    } finally {
      setIsUploading(false)
      e.target.value = ""
    }
  }

  const handleMove = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= galleryImages.length) return

    const updated = [...galleryImages]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp

    const reindexed = updated.map((img, idx) => ({ ...img, sort_order: idx }))
    onChangeGalleryImages(reindexed)
  }

  const handleUpdateItem = (index, field, value) => {
    const updated = [...galleryImages]
    updated[index] = { ...updated[index], [field]: value }
    onChangeGalleryImages(updated)
  }

  const handleRemove = (index) => {
    const updated = galleryImages.filter((_, idx) => idx !== index)
    const reindexed = updated.map((img, idx) => ({ ...img, sort_order: idx }))
    onChangeGalleryImages(reindexed)
  }

  return (
    <div className="post-gallery-manager">
      <div className="post-gallery-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--dash-navy)", margin: 0 }}>Additional Gallery Images</h3>
          <p style={{ fontSize: "13px", color: "var(--dash-text-secondary)", margin: "4px 0 0 0" }}>
            Add photo galleries to be displayed inside the article detail view.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="edit-action-btn"
            onClick={() => setShowMediaPicker(true)}
            disabled={isUploading}
            style={{ fontSize: "13px", padding: "6px 12px" }}
          >
            <Plus size={14} />
            <span>From Media Library</span>
          </button>

          <label className="edit-action-btn" style={{ fontSize: "13px", padding: "6px 12px", cursor: isUploading ? "not-allowed" : "pointer" }}>
            {isUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
            <span>{isUploading ? "Uploading..." : "Upload New"}</span>
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleDirectUpload}
              disabled={isUploading}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>

      {uploadError && (
        <div style={{ padding: "8px 12px", backgroundColor: "rgba(203, 54, 49, 0.1)", color: "#cb3631", borderRadius: "6px", fontSize: "13px", marginBottom: "12px" }}>
          {uploadError}
        </div>
      )}

      {galleryImages.length === 0 ? (
        <div className="gallery-empty-state" style={{ padding: "24px", textAlign: "center", border: "1px dashed var(--dash-border)", borderRadius: "8px", background: "#fafafa" }}>
          <ImageIcon size={32} style={{ color: "#94a3b8", marginBottom: "8px" }} />
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>No additional gallery images attached yet.</p>
        </div>
      ) : (
        <div className="gallery-items-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {galleryImages.map((imgItem, idx) => (
            <div
              key={imgItem.id || idx}
              className="gallery-item-card"
              style={{
                display: "flex",
                gap: "16px",
                padding: "12px",
                border: "1px solid var(--dash-border)",
                borderRadius: "8px",
                background: "#ffffff",
                alignItems: "center"
              }}
            >
              <div style={{ width: "80px", height: "60px", flexShrink: 0, borderRadius: "6px", overflow: "hidden", background: "#f1f5f9" }}>
                <img src={imgItem.image_url} alt={imgItem.alt_text || "Gallery image"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Alt Text
                  </label>
                  <input
                    type="text"
                    value={imgItem.alt_text || ""}
                    onChange={(e) => handleUpdateItem(idx, "alt_text", e.target.value)}
                    placeholder="Describe image..."
                    style={{ width: "100%", padding: "6px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Caption
                  </label>
                  <input
                    type="text"
                    value={imgItem.caption || ""}
                    onChange={(e) => handleUpdateItem(idx, "caption", e.target.value)}
                    placeholder="Photo caption (optional)..."
                    style={{ width: "100%", padding: "6px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="control-btn-sm"
                  title="Move Up"
                  style={{ opacity: idx === 0 ? 0.4 : 1, padding: "6px", cursor: idx === 0 ? "not-allowed" : "pointer" }}
                >
                  <ArrowUp size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === galleryImages.length - 1}
                  className="control-btn-sm"
                  title="Move Down"
                  style={{ opacity: idx === galleryImages.length - 1 ? 0.4 : 1, padding: "6px", cursor: idx === galleryImages.length - 1 ? "not-allowed" : "pointer" }}
                >
                  <ArrowDown size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="control-btn-sm danger"
                  title="Remove from post gallery"
                  style={{ padding: "6px", color: "#cb3631", cursor: "pointer", background: "none", border: "none" }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showMediaPicker && (
        <MediaPickerModal
          onClose={() => setShowMediaPicker(false)}
          onSelect={handleSelectFromPicker}
        />
      )}
    </div>
  )
}

