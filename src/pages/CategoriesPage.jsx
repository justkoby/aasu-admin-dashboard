import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { createSlug } from '../utils/createSlug'
import {
  FolderKanban,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Edit2,
  Trash2,
  Power,
  FileText
} from 'lucide-react'
import '../styles/dashboard.css'
import '../styles/categories.css'

const logSupabaseError = (operation, error, extra = {}) => {
  if (!error) return
  console.error(`[AASU Categories Management] Supabase Error during ${operation}:`, {
    operation,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    extra,
    errorObj: error
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

export default function CategoriesPage() {
  const { profile: authProfile } = useAuth()

  // ── Data state ──
  const [categories, setCategories] = useState([])
  const [postCountMap, setPostCountMap] = useState(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasIsActiveColumn, setHasIsActiveColumn] = useState(true)

  // ── Filter state ──
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // ── Modal state ──
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null) // null = create mode
  const [isSaving, setIsSaving] = useState(false)
  const [notification, setNotification] = useState(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Unnested Data Loading (Query 1: categories, Query 2: post_categories)
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let fetchedCategories = []
    let activeColumnSupported = true

    // Query 1: Fetch Categories
    try {
      let catRes = await supabase
        .from('categories')
        .select('id, name, slug, description, is_active, created_at, updated_at')
        .order('name', { ascending: true })

      if (catRes.error && catRes.error.code === '42703') {
        // Fallback if is_active column is not present on categories table
        logSupabaseError('categories.select (fallback without is_active)', catRes.error)
        activeColumnSupported = false
        catRes = await supabase
          .from('categories')
          .select('id, name, slug, description, created_at, updated_at')
          .order('name', { ascending: true })
      }

      if (catRes.error) {
        logSupabaseError('categories.select', catRes.error)
        throw catRes.error
      }

      fetchedCategories = (catRes.data || []).map(cat => ({
        ...cat,
        is_active: cat.is_active !== undefined ? Boolean(cat.is_active) : true
      }))
    } catch (err) {
      logSupabaseError('categories.select (exception)', err)
      setError(err)
      setIsLoading(false)
      return
    }

    setHasIsActiveColumn(activeColumnSupported)

    // Query 2: Fetch Post Categories associations to calculate post counts separately
    const countMap = new Map()
    try {
      const { data: pcData, error: pcErr } = await supabase
        .from('post_categories')
        .select('category_id')

      if (pcErr) {
        logSupabaseError('post_categories.select (associations)', pcErr)
      } else if (pcData) {
        pcData.forEach(row => {
          if (row.category_id) {
            countMap.set(row.category_id, (countMap.get(row.category_id) || 0) + 1)
          }
        })
      }
    } catch (err) {
      logSupabaseError('post_categories.select (exception)', err)
    }

    setCategories(fetchedCategories)
    setPostCountMap(countMap)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered Categories List
  // ─────────────────────────────────────────────────────────────────────────

  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      const term = searchTerm.trim().toLowerCase()
      if (term) {
        const matchName = (cat.name || '').toLowerCase().includes(term)
        const matchSlug = (cat.slug || '').toLowerCase().includes(term)
        const matchDesc = (cat.description || '').toLowerCase().includes(term)
        if (!matchName && !matchSlug && !matchDesc) return false
      }
      if (statusFilter === 'active' && !cat.is_active) return false
      if (statusFilter === 'inactive' && cat.is_active) return false
      return true
    })
  }, [categories, searchTerm, statusFilter])

  // Summary counts
  const totalCount = categories.length
  const activeCount = categories.filter(c => c.is_active).length
  const inactiveCount = categories.filter(c => !c.is_active).length

  // ─────────────────────────────────────────────────────────────────────────
  // Modal & CRUD Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingCategory(null)
    setNotification(null)
    setIsModalOpen(true)
  }

  const openEditModal = (cat) => {
    setEditingCategory(cat)
    setNotification(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setNotification(null)
  }

  /**
   * Save Category (Create or Update)
   */
  const handleSaveCategory = async (formData) => {
    const isEdit = Boolean(editingCategory)
    const name = formData.name.trim()
    const slug = (formData.slug || createSlug(name)).toLowerCase().trim()
    const description = formData.description.trim()
    const isActiveVal = formData.is_active

    if (!name) {
      setNotification({ type: 'error', message: 'Category name is required.' })
      return false
    }

    if (!slug) {
      setNotification({ type: 'error', message: 'Category URL slug is required.' })
      return false
    }

    // Client-side duplicate check against current categories
    const duplicateName = categories.find(c =>
      c.name.toLowerCase() === name.toLowerCase() && (!isEdit || c.id !== editingCategory.id)
    )
    if (duplicateName) {
      setNotification({
        type: 'error',
        message: `A category with the name "${name}" already exists. Please choose a unique name.`
      })
      return false
    }

    const duplicateSlug = categories.find(c =>
      c.slug.toLowerCase() === slug.toLowerCase() && (!isEdit || c.id !== editingCategory.id)
    )
    if (duplicateSlug) {
      setNotification({
        type: 'error',
        message: `A category with the slug "${slug}" already exists. Please choose a unique slug.`
      })
      return false
    }

    setIsSaving(true)
    setNotification(null)

    try {
      const payload = {
        name,
        slug,
        description: description || null,
        updated_at: new Date().toISOString()
      }

      if (hasIsActiveColumn) {
        payload.is_active = isActiveVal
      }

      let resultError = null
      let savedData = null

      if (isEdit) {
        const res = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editingCategory.id)
          .select()
          .single()
        resultError = res.error
        savedData = res.data
      } else {
        const res = await supabase
          .from('categories')
          .insert(payload)
          .select()
          .single()
        resultError = res.error
        savedData = res.data
      }

      if (resultError) {
        logSupabaseError(isEdit ? 'categories.update' : 'categories.insert', resultError, payload)
        if (resultError.code === '23505') {
          setNotification({
            type: 'error',
            message: 'A category with this name or slug already exists in the database.'
          })
        } else {
          setNotification({
            type: 'error',
            message: `Failed to ${isEdit ? 'update' : 'create'} category: ${resultError.message || 'Database error.'}`
          })
        }
        return false
      }

      // Refetch authoritative database state
      await loadData()

      setNotification({
        type: 'success',
        message: `Category "${savedData?.name || name}" ${isEdit ? 'updated' : 'created'} successfully.`
      })
      closeModal()
      return true
    } catch (err) {
      logSupabaseError('categories.save (exception)', err)
      setNotification({
        type: 'error',
        message: `An unexpected error occurred: ${err.message || 'Operation failed.'}`
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Toggle Active / Inactive status
   */
  const handleToggleActive = async (cat) => {
    if (!hasIsActiveColumn) {
      setNotification({
        type: 'error',
        message: 'Active status column is not enabled in the database schema.'
      })
      return
    }

    const nextStatus = !cat.is_active
    const confirm = window.confirm(
      nextStatus
        ? `Reactivate category "${cat.name}"? It will become available for post assignment.`
        : `Deactivate category "${cat.name}"? New posts will not be able to select it.`
    )
    if (!confirm) return

    setIsSaving(true)
    setNotification(null)

    try {
      const { data, error: updateErr } = await supabase
        .from('categories')
        .update({
          is_active: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', cat.id)
        .select()
        .single()

      if (updateErr) {
        logSupabaseError('categories.update (toggle active)', updateErr, { id: cat.id, nextStatus })
        setNotification({
          type: 'error',
          message: `Failed to update category status: ${updateErr.message || 'Database error.'}`
        })
        return
      }

      setNotification({
        type: 'success',
        message: `Category "${cat.name}" is now ${nextStatus ? 'active' : 'inactive'}.`
      })
      await loadData()
    } catch (err) {
      logSupabaseError('categories.toggleActive (exception)', err)
      setNotification({ type: 'error', message: 'Failed to update category status.' })
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Delete Category (Only permitted when post count === 0)
   */
  const handleDeleteCategory = async (cat) => {
    const postCount = postCountMap.get(cat.id) || 0
    if (postCount > 0) {
      setNotification({
        type: 'error',
        message: `Cannot delete category "${cat.name}" because it is currently attached to ${postCount} post(s). Please deactivate it instead or remove it from those posts first.`
      })
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete category "${cat.name}"? This action cannot be undone.`
    )
    if (!confirmed) return

    setIsSaving(true)
    setNotification(null)

    try {
      const { error: delErr } = await supabase
        .from('categories')
        .delete()
        .eq('id', cat.id)

      if (delErr) {
        logSupabaseError('categories.delete', delErr, { id: cat.id })
        setNotification({
          type: 'error',
          message: `Failed to delete category: ${delErr.message || 'Database error.'}`
        })
        return
      }

      setNotification({
        type: 'success',
        message: `Category "${cat.name}" was permanently deleted.`
      })
      await loadData()
    } catch (err) {
      logSupabaseError('categories.delete (exception)', err)
      setNotification({ type: 'error', message: 'Failed to delete category.' })
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
        <h3>Failed to Load Categories</h3>
        <p>An error occurred while fetching category records from Supabase.</p>
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
      <div className="categories-page-header">
        <div>
          <h2>Category Management</h2>
          <p>Organize news reports, blog insights, and topic channels across AASU CMS.</p>
        </div>
        <button
          type="button"
          className="add-category-btn"
          onClick={openAddModal}
          disabled={isLoading}
        >
          <Plus size={16} />
          <span>Add Category</span>
        </button>
      </div>

      {/* Top Notification Banner */}
      {notification && !isModalOpen && (
        <div className={`users-notification ${notification.type}`} style={{ marginBottom: '20px' }}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Summary strip */}
      {!isLoading && (
        <p className="categories-summary-strip">
          Showing <strong>{filteredCategories.length}</strong> of <strong>{totalCount}</strong> categories
          {' · '}
          <strong>{activeCount}</strong> active
          {inactiveCount > 0 && `, ${inactiveCount} inactive`}
        </p>
      )}

      {/* Filter Bar */}
      <div className="categories-filter-bar">
        <div className="filter-group search">
          <label htmlFor="category-search">Search</label>
          <input
            id="category-search"
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Name, slug, or description..."
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="category-status-filter">Status</label>
          <select
            id="category-status-filter"
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

      {/* Categories Table / Card Grid */}
      {isLoading ? (
        <div className="categories-card-container" style={{ padding: '24px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div className="skeleton skeleton-circle" />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '35%', height: '16px', marginBottom: '8px' }} />
                <div className="skeleton skeleton-text" style={{ width: '65%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="categories-card-container">
          <div className="empty-state">
            <FolderKanban size={48} className="empty-state-icon" />
            <h3>No categories found</h3>
            <p>
              {searchTerm || statusFilter
                ? 'No categories match your search criteria. Clear filters and try again.'
                : 'No categories exist in the database yet. Click "Add Category" above to create one.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="categories-card-container">
          {/* Desktop Table */}
          <table className="categories-list-table" aria-label="AASU Categories">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th>Posts Attached</th>
                <th>Created</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map(cat => {
                const postCount = postCountMap.get(cat.id) || 0
                return (
                  <tr key={cat.id}>
                    <td>
                      <div className="category-name-block">
                        <span className="category-name-text">{cat.name}</span>
                        <span className="category-slug-badge">{cat.slug}</span>
                      </div>
                    </td>
                    <td>
                      <div className="category-desc-cell" title={cat.description || '—'}>
                        {cat.description || '—'}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${cat.is_active ? 'active' : 'inactive'}`}>
                        <span className="status-pill-dot" />
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span className="post-count-badge">
                        <FileText size={13} />
                        {postCount} {postCount === 1 ? 'post' : 'posts'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--dash-text-secondary)', fontSize: '13px' }}>
                      {formatDate(cat.created_at)}
                    </td>
                    <td>
                      <div className="category-action-group">
                        <button
                          type="button"
                          className="category-edit-btn"
                          onClick={() => openEditModal(cat)}
                          title="Edit category"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          className={`category-status-btn ${cat.is_active ? 'deactivate' : 'activate'}`}
                          onClick={() => handleToggleActive(cat)}
                          title={cat.is_active ? 'Deactivate category' : 'Reactivate category'}
                        >
                          <Power size={13} />
                          <span>{cat.is_active ? 'Deactivate' : 'Activate'}</span>
                        </button>

                        <button
                          type="button"
                          className="category-delete-btn"
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={postCount > 0}
                          title={postCount > 0 ? `Cannot delete: ${postCount} post(s) attached` : 'Delete category'}
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Mobile Grid */}
          <div className="categories-mobile-grid">
            {filteredCategories.map(cat => {
              const postCount = postCountMap.get(cat.id) || 0
              return (
                <div className="category-mobile-card" key={cat.id}>
                  <div className="category-mobile-header">
                    <div className="category-name-block">
                      <span className="category-name-text">{cat.name}</span>
                      <span className="category-slug-badge">{cat.slug}</span>
                    </div>
                    <span className={`status-pill ${cat.is_active ? 'active' : 'inactive'}`}>
                      <span className="status-pill-dot" />
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {cat.description && (
                    <p style={{ fontSize: '13px', color: 'var(--dash-text-secondary)', margin: 0 }}>
                      {cat.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--dash-text-secondary)' }}>
                    <span>
                      <FileText size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                      <strong>{postCount}</strong> posts
                    </span>
                    <span>Joined {formatDate(cat.created_at)}</span>
                  </div>

                  <div className="category-mobile-actions">
                    <button
                      type="button"
                      className="category-edit-btn"
                      onClick={() => openEditModal(cat)}
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className={`category-status-btn ${cat.is_active ? 'deactivate' : 'activate'}`}
                      onClick={() => handleToggleActive(cat)}
                    >
                      <Power size={13} />
                      <span>{cat.is_active ? 'Deactivate' : 'Activate'}</span>
                    </button>
                    <button
                      type="button"
                      className="category-delete-btn"
                      onClick={() => handleDeleteCategory(cat)}
                      disabled={postCount > 0}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Category Modal (Add / Edit) ── */}
      {isModalOpen && (
        <CategoryModal
          category={editingCategory}
          isSaving={isSaving}
          notification={notification}
          onClose={closeModal}
          onSave={handleSaveCategory}
        />
      )}
    </div>
  )
}

// ─── Category Modal Component ──────────────────────────────────────────────────

function CategoryModal({ category, isSaving, notification, onClose, onSave }) {
  const isEdit = Boolean(category)

  const [name, setName] = useState(category?.name || '')
  const [slug, setSlug] = useState(category?.slug || '')
  const [description, setDescription] = useState(category?.description || '')
  const [isActive, setIsActive] = useState(category?.is_active !== undefined ? category.is_active : true)
  const [customSlugEdited, setCustomSlugEdited] = useState(isEdit)

  // Auto-generate slug from name if user hasn't custom edited the slug
  const handleNameChange = (e) => {
    const val = e.target.value
    setName(val)
    if (!customSlugEdited) {
      setSlug(createSlug(val))
    }
  }

  const handleSlugChange = (e) => {
    setSlug(e.target.value)
    setCustomSlugEdited(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      name,
      slug,
      description,
      is_active: isActive
    })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
      <div className="category-modal">
        {/* Header */}
        <div className="category-modal-header">
          <h2 id="category-modal-title">{isEdit ? 'Edit Category' : 'Add New Category'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal" disabled={isSaving}>
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit}>
          <div className="category-modal-body">
            {/* Modal Notification */}
            {notification && (
              <div className={`users-notification ${notification.type}`} style={{ marginBottom: 0 }}>
                {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{notification.message}</span>
              </div>
            )}

            {/* Category Name */}
            <div className="modal-form-group">
              <label htmlFor="cat-name-input">
                Category Name <span className="required-star">*</span>
              </label>
              <input
                id="cat-name-input"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Education, Press Release"
                required
                disabled={isSaving}
              />
            </div>

            {/* URL Slug */}
            <div className="modal-form-group">
              <label htmlFor="cat-slug-input">
                URL Slug <span className="required-star">*</span>
              </label>
              <input
                id="cat-slug-input"
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder="e.g. education, press-release"
                required
                disabled={isSaving}
              />
              <p className="modal-form-hint">
                Unique URL identifier used for filtering posts (auto-generated from name).
              </p>
            </div>

            {/* Description */}
            <div className="modal-form-group">
              <label htmlFor="cat-desc-input">Description</label>
              <textarea
                id="cat-desc-input"
                rows="3"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief summary of topics included in this category..."
                disabled={isSaving}
              ></textarea>
            </div>

            {/* Active Status Toggle */}
            <div className="modal-form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  disabled={isSaving}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--dash-navy)' }}>
                  Active Category
                </span>
              </label>
              <p className="modal-form-hint" style={{ marginTop: '4px' }}>
                Active categories are selectable in the Post Editor. Inactive categories remain assigned to existing posts.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="category-modal-footer">
            <button type="button" className="category-modal-cancel-btn" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="category-modal-save-btn" disabled={isSaving}>
              <CheckCircle2 size={16} />
              <span>{isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Category'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
