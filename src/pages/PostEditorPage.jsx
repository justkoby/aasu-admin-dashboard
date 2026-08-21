import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { createSlug } from '../utils/createSlug'
import RichTextEditor from '../components/posts/RichTextEditor'
import FeaturedImageUploader from '../components/posts/FeaturedImageUploader'
import { ArrowLeft, Save, Sparkles, CheckCircle2, AlertTriangle, FileCheck, MessageSquareText, ChevronDown, ChevronUp } from 'lucide-react'
import '../styles/posts.css'

// Form Zod Validation Schema
const schema = z.object({
  type: z.enum(['news', 'blog'], {
    errorMap: () => ({ message: 'Post type must be News or Blog.' })
  }),
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(200, 'Title cannot exceed 200 characters.'),
  slug: z
    .string()
    .min(1, 'Slug is required.')
    .regex(/^[a-z0-9-_]+$/, 'Slug must contain only lowercase letters, numbers, dashes, or underscores.'),
  excerpt: z
    .string()
    .min(1, 'Excerpt summary is required.')
    .max(500, 'Excerpt summary cannot exceed 500 characters.'),
  content: z.string().min(1, 'Article content is required.'),
  featured_image_url: z.string().url('Featured image is required.'),
  featured_image_alt: z.string().min(1, 'Alternative description text is required.'),
  region: z.string().optional(),
  theme: z.string().optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  hero_position: z.enum(['none', 'primary', 'secondary']).optional(),
  featured_until: z.string().nullable().optional()
})

export default function PostEditorPage() {
  const { id } = useParams() // For editing posts
  const isEditMode = !!id
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  const userRole = profile?.role || 'contributor'

  // Component States
  const [categories, setCategories] = useState([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [originalPost, setOriginalPost] = useState(null)
  // Editorial feedback notes attached to a returned draft
  const [reviewNotes, setReviewNotes] = useState([])
  // Collapsible older-notes history inside the feedback panel
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false)
  
  const [isLoading, setIsLoading] = useState(isEditMode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // { type: 'success'|'error'|'warning', message: '' }

  // React Hook Form initialization
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors, isDirty }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'news',
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      featured_image_url: '',
      featured_image_alt: '',
      region: '',
      theme: '',
      seo_title: '',
      seo_description: '',
      hero_position: 'none',
      featured_until: ''
    }
  })

  const titleVal = watch('title')
  const slugVal = watch('slug')

  // Warn about unsaved changes on tab close/unload
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Fetch categories on mount
  useEffect(() => {
    let isMounted = true
    const fetchCategories = async () => {
      try {
        const { data, error: catErr } = await supabase
          .from('categories')
          .select('id, name')
          .order('name')
        
        if (catErr) throw catErr
        if (isMounted) setCategories(data || [])
      } catch (err) {
        console.error('Error fetching categories:', err)
      }
    }
    fetchCategories()
    return () => {
      isMounted = false
    }
  }, [])

  // Auto-generate slug from title (only if not in edit mode or slug has not been manually customized)
  useEffect(() => {
    if (!isEditMode && titleVal) {
      setValue('slug', createSlug(titleVal), { shouldValidate: true })
    }
  }, [titleVal, setValue, isEditMode])

  // Load existing post in edit mode
  useEffect(() => {
    if (!isEditMode || authLoading) return
    let isMounted = true

    const loadPost = async () => {
      setIsLoading(true)
      try {
        // 1. Fetch Post details
        const { data: post, error: postErr } = await supabase
          .from('posts')
          .select('*')
          .eq('id', id)
          .single()

        if (postErr) throw postErr
        if (!post) throw new Error('Post not found.')

        // 2. Fetch selected Category connections
        const { data: catConnections, error: connErr } = await supabase
          .from('post_categories')
          .select('category_id')
          .eq('post_id', id)
        
        if (connErr) throw connErr

        if (isMounted) {
          setOriginalPost(post)
          
          // Populate form fields
          setValue('type', post.type || 'news')
          setValue('title', post.title || '')
          setValue('slug', post.slug || '')
          setValue('excerpt', post.excerpt || '')
          setValue('content', post.content || '')
          setValue('featured_image_url', post.featured_image_url || '')
          setValue('featured_image_alt', post.featured_image_alt || '')
          setValue('region', post.region || '')
          setValue('theme', post.theme || '')
          setValue('seo_title', post.seo_title || '')
          setValue('seo_description', post.seo_description || '')
          setValue('hero_position', post.hero_position || 'none')
          
          // Convert date to HTML format yyyy-MM-dd if present
          if (post.featured_until) {
            const formattedDate = new Date(post.featured_until).toISOString().split('T')[0]
            setValue('featured_until', formattedDate)
          } else {
            setValue('featured_until', '')
          }

          setSelectedCategoryIds(catConnections.map((conn) => conn.category_id))
        }

        // 3. Fetch editorial feedback when the draft was returned with review notes
        if (post.status === 'draft') {
          try {
            let notesResult = await supabase
              .from('review_notes')
              .select('*, author:profiles!review_notes_author_id_fkey(full_name, email)')
              .eq('post_id', id)
              .order('created_at', { ascending: false })

            if (notesResult.error) {
              console.warn('Review notes join failed, running fallback query:', notesResult.error)
              notesResult = await supabase
                .from('review_notes')
                .select('*')
                .eq('post_id', id)
                .order('created_at', { ascending: false })
            }

            if (!notesResult.error && isMounted) {
              setReviewNotes(notesResult.data || [])
            }
          } catch (notesErr) {
            console.warn('Could not load review notes for the editor:', notesErr)
          }
        }
      } catch (err) {
        console.error('Error loading post:', err)
        if (isMounted) {
          setSaveStatus({
            type: 'error',
            message: 'Failed to load post data from the database. Please return to the posts list.'
          })
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadPost()
    return () => {
      isMounted = false
    }
  }, [id, isEditMode, authLoading, setValue])

  const handleCategoryToggle = (catId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  const handleRegenerateSlug = () => {
    if (titleVal) {
      setValue('slug', createSlug(titleVal), { shouldValidate: true, shouldDirty: true })
    }
  }

  const handleCancelClick = () => {
    if (isDirty) {
      const confirm = window.confirm(
        'You have unsaved changes in this post editor. Are you sure you want to discard them and return to the posts list?'
      )
      if (!confirm) return
    }
    navigate('/dashboard/posts')
  }

  // Format a timestamp including date and time for review notes
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return 'N/A'
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return 'N/A'
    }
  }

  // Human-readable reviewer name — never expose raw UUIDs
  const resolveReviewer = (note) => {
    if (note.author?.full_name) return note.author.full_name
    if (note.author?.email) return note.author.email
    return 'Administrator'
  }

  // Common Post Saving Logic
  const handleSavePost = async (formValues, statusAction) => {
    setIsSubmitting(true)
    setSaveStatus(null)

    try {
      const currentSlug = formValues.slug.toLowerCase().trim()

      // 1. Slug collision check (cannot overwrite silently)
      let query = supabase.from('posts').select('id').eq('slug', currentSlug)
      if (isEditMode) {
        query = query.neq('id', id)
      }
      
      const { data: duplicatePost, error: checkErr } = await query.maybeSingle()
      if (checkErr) throw checkErr

      if (duplicatePost) {
        throw new Error(
          'Slug collision detected. The URL slug already exists. Please choose a different slug or title.'
        )
      }

      // 2. Build Database columns payload — all enum fields must be exact lowercase PostgreSQL values
      const payload = {
        title: formValues.title,
        slug: currentSlug,
        excerpt: formValues.excerpt,
        content: formValues.content,
        featured_image_url: formValues.featured_image_url,
        featured_image_alt: formValues.featured_image_alt,
        // 'type' comes from the form as a lowercase enum value (news | blog)
        type: formValues.type,
        region: formValues.region || null,
        theme: formValues.theme || null,
        seo_title: formValues.seo_title || null,
        seo_description: formValues.seo_description || null
      }

      // Administrator controls — hero_position is a lowercase enum: none | primary | secondary
      if (userRole === 'super_admin' || userRole === 'communications_admin') {
        // Default to 'none' if not set; form already stores lowercase values
        payload.hero_position = formValues.hero_position || 'none'
        payload.featured_until = formValues.featured_until || null
      }

      // Status-specific updates — all status values are lowercase enums
      if (statusAction === 'publish') {
        payload.status = 'published'
        // Preserve original published_at if it already exists
        payload.published_at = originalPost?.published_at || new Date().toISOString()
      } else if (statusAction === 'submit') {
        payload.status = 'in_review'
        payload.submitted_at = new Date().toISOString()
      } else {
        // draft — default save action
        payload.status = 'draft'
      }

      // Author constraints
      if (!isEditMode) {
        payload.author_id = user.id
      } else {
        // Preserve original author
        payload.author_id = originalPost.author_id
      }

      // 3. Upsert Post Record
      let savedPost = null
      if (isEditMode) {
        const { data, error: updateErr } = await supabase
          .from('posts')
          .update(payload)
          .eq('id', id)
          .select()
          .single()
        
        if (updateErr) throw updateErr
        savedPost = data
      } else {
        const { data, error: insertErr } = await supabase
          .from('posts')
          .insert(payload)
          .select()
          .single()
        
        if (insertErr) throw insertErr
        savedPost = data
      }

      // 4. Save Category Assignments safely (do not fail post save if categories mapping fails)
      let categoryAssignmentSuccess = true
      try {
        // Clear previous categories
        const { error: clearErr } = await supabase
          .from('post_categories')
          .delete()
          .eq('post_id', savedPost.id)
        
        if (clearErr) throw clearErr

        // Insert new mappings
        if (selectedCategoryIds.length > 0) {
          const mappings = selectedCategoryIds.map((catId) => ({
            post_id: savedPost.id,
            category_id: catId
          }))
          const { error: mapErr } = await supabase.from('post_categories').insert(mappings)
          if (mapErr) throw mapErr
        }
      } catch (catErr) {
        console.error('Failed to link category assignments:', catErr)
        categoryAssignmentSuccess = false
      }

      // 5. Report save state
      if (!categoryAssignmentSuccess) {
        setSaveStatus({
          type: 'warning',
          message: 'Post saved successfully, but category assignment failed. Please open the post again to re-apply categories.'
        })
      } else if (statusAction === 'submit' && reviewNotes.length > 0) {
        // Resubmission of a revised draft — confirm on the Review Feedback page
        navigate('/dashboard/review', {
          state: {
            message: `"${formValues.title || 'The revised post'}" was sent back for review. The editorial team will take another look.`
          }
        })
      } else {
        // Success -> redirect
        navigate('/dashboard/posts')
      }
    } catch (err) {
      // Log full technical error for development debugging
      console.error('Post save failed:', err)

      // Show a friendly message to the user — avoid exposing raw DB internals
      const isNetworkErr =
        err.message?.toLowerCase().includes('failed to fetch') ||
        err.message?.toLowerCase().includes('networkerror')
      const isSlugConflict = err.message?.toLowerCase().includes('slug')

      let friendlyMessage =
        'An unexpected error occurred while saving the post. Please try again.'
      if (isNetworkErr) {
        friendlyMessage = 'Network error. Please check your internet connection and try again.'
      } else if (isSlugConflict) {
        friendlyMessage = err.message // Slug collision messages are already user-friendly
      }

      setSaveStatus({ type: 'error', message: friendlyMessage })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler for Save Draft
  const onSaveDraft = async (formValues) => {
    await handleSavePost(formValues, 'draft')
  }

  // Handler for Submit Review
  const onSubmitReview = async (formValues) => {
    await handleSavePost(formValues, 'submit')
  }

  // Handler for Publish (requires Admin credentials and confirm dialog)
  const onPublish = async (formValues) => {
    // Administrator confirmation check
    const confirm = window.confirm(
      'Are you sure you want to publish this post? It will become visible on the public website immediately.'
    )
    if (!confirm) return

    await handleSavePost(formValues, 'publish')
  }

  if (authLoading || isLoading) {
    return (
      <div className="auth-loader-container">
        <div className="auth-loader"></div>
        <p>Loading Editor...</p>
      </div>
    )
  }

  const isAdmin = userRole === 'super_admin' || userRole === 'communications_admin'

  return (
    <div className="dashboard-content-wrapper">
      {/* Editor Header Navigation */}
      <div
        className="panel-header"
        style={{
          border: 'none',
          padding: '0 0 24px 0',
          background: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <button
            type="button"
            onClick={handleCancelClick}
            className="edit-action-btn"
            style={{ marginBottom: '12px' }}
          >
            <ArrowLeft size={14} />
            <span>Back to Posts</span>
          </button>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--dash-navy)' }}>
            {isEditMode ? 'Edit Post' : 'Add New Post'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--dash-text-secondary)' }}>
            {isEditMode
              ? `Modifying "${originalPost?.title || 'Draft Article'}"`
              : 'Compile news reports, blog insights, and content updates.'}
          </p>
        </div>
      </div>

      {/* Save Notification Banner */}
      {saveStatus && (
        <div
          className={`editor-notification-banner ${saveStatus.type}`}
          style={{ marginBottom: '24px' }}
        >
          {saveStatus.type === 'error' ? (
            <AlertTriangle size={20} />
          ) : (
            <CheckCircle2 size={20} />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Requested Changes Feedback Panel (drafts with review notes only) */}
      {isEditMode && reviewNotes.length > 0 && (
        <div className="editor-feedback-panel">
          <div className="editor-feedback-header">
            <MessageSquareText size={18} />
            <h3>Changes Requested</h3>
          </div>
          <p className="editor-feedback-instruction">
            An administrator has reviewed this draft and requested changes. Update the article
            below using their feedback, then submit it for review again. Your feedback history
            is preserved and visible to the editorial team.
          </p>

          {/* Latest review note (newest first) */}
          <div className="review-note-item editor-feedback-latest-note">
            <div className="review-note-header">
              <span className="review-note-author">{resolveReviewer(reviewNotes[0])}</span>
              <span className="review-note-date">{formatDateTime(reviewNotes[0].created_at)}</span>
            </div>
            <p className="review-note-text">{reviewNotes[0].note}</p>
          </div>

          {/* Collapsible earlier feedback history */}
          {reviewNotes.length > 1 && (
            <div className="editor-feedback-history">
              <button
                type="button"
                className="editor-feedback-history-toggle"
                onClick={() => setShowFeedbackHistory(!showFeedbackHistory)}
                aria-expanded={showFeedbackHistory}
              >
                {showFeedbackHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>
                  {showFeedbackHistory
                    ? 'Hide feedback history'
                    : `View feedback history (${reviewNotes.length - 1} earlier ${
                        reviewNotes.length - 1 === 1 ? 'note' : 'notes'
                      })`}
                </span>
              </button>

              {showFeedbackHistory && (
                <div className="editor-feedback-notes">
                  {reviewNotes.slice(1).map((note) => (
                    <div className="review-note-item" key={note.id}>
                      <div className="review-note-header">
                        <span className="review-note-author">{resolveReviewer(note)}</span>
                        <span className="review-note-date">{formatDateTime(note.created_at)}</span>
                      </div>
                      <p className="review-note-text">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Core Layout Grid */}
      <form onSubmit={handleSubmit(onSaveDraft)} className="editor-grid-layout">
        {/* Left main area */}
        <div className="editor-main-panel">
          {/* Card: Primary Details */}
          <div className="editor-card">
            <h2>Post Content</h2>

            <div className="editor-form-group">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                type="text"
                {...register('title')}
                placeholder="Enter post title..."
                className={errors.title ? 'has-error' : ''}
                disabled={isSubmitting}
              />
              {errors.title && (
                <span className="validation-error-text">{errors.title.message}</span>
              )}
            </div>

            <div className="editor-form-group">
              <label htmlFor="slug">URL Slug</label>
              <div className="slug-input-wrapper">
                <input
                  id="slug"
                  type="text"
                  {...register('slug')}
                  placeholder="url-safe-post-slug"
                  className={errors.slug ? 'has-error' : ''}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={handleRegenerateSlug}
                  className="edit-action-btn"
                  title="Generate from title"
                  disabled={isSubmitting}
                >
                  <Sparkles size={14} />
                  <span>Auto</span>
                </button>
              </div>
              <p className="uploader-hint" style={{ marginTop: '2px', textAlign: 'left' }}>
                Used in the URL path. (e.g. <code>aasu-news-update</code>).
              </p>
              {errors.slug && (
                <span className="validation-error-text">{errors.slug.message}</span>
              )}
            </div>

            <div className="editor-form-group">
              <label htmlFor="excerpt">Excerpt Summary</label>
              <textarea
                id="excerpt"
                rows="3"
                {...register('excerpt')}
                placeholder="A short summary of this article to display in cards and list feeds..."
                className={errors.excerpt ? 'has-error' : ''}
                disabled={isSubmitting}
              ></textarea>
              {errors.excerpt && (
                <span className="validation-error-text">{errors.excerpt.message}</span>
              )}
            </div>

            {/* Rich Text Editor */}
            <div className="editor-form-group">
              <label htmlFor="content">Article Body Content</label>
              <Controller
                name="content"
                control={control}
                render={({ field }) => (
                  <RichTextEditor value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.content && (
                <span className="validation-error-text">{errors.content.message}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right side settings panel */}
        <div className="editor-settings-sidebar">
          {/* Card: Publishing Controls */}
          <div className="editor-card">
            <h2>Publishing Settings</h2>

            <div className="editor-form-group">
              <label htmlFor="type">Post Type</label>
              <select id="type" {...register('type')} disabled={isSubmitting}>
                <option value="news">News</option>
                <option value="blog">Blog</option>
              </select>
              {errors.type && (
                <span className="validation-error-text">{errors.type.message}</span>
              )}
            </div>

            <div className="editor-form-group">
              <label htmlFor="region">Regional Focus</label>
              <select id="region" {...register('region')} disabled={isSubmitting}>
                <option value="">None / Regional</option>
                <option value="North Africa">North Africa</option>
                <option value="West Africa">West Africa</option>
                <option value="East Africa">East Africa</option>
                <option value="Central Africa">Central Africa</option>
                <option value="Southern Africa">Southern Africa</option>
                <option value="Diaspora">Diaspora</option>
                <option value="International">International</option>
              </select>
            </div>

            <div className="editor-form-group">
              <label htmlFor="theme">Thematic Focus</label>
              <input
                id="theme"
                type="text"
                {...register('theme')}
                placeholder="e.g. Education, Advocacy"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Card: Featured Image */}
          <div className="editor-card">
            <h2>Featured Image</h2>
            <Controller
              name="featured_image_url"
              control={control}
              render={({ field }) => (
                <FeaturedImageUploader
                  url={field.value}
                  onChangeUrl={field.onChange}
                  alt={watch('featured_image_alt')}
                  onChangeAlt={(val) => setValue('featured_image_alt', val, { shouldValidate: true, shouldDirty: true })}
                  userId={user.id}
                  errorUrl={errors.featured_image_url}
                  errorAlt={errors.featured_image_alt}
                />
              )}
            />
          </div>

          {/* Card: Categories */}
          <div className="editor-card">
            <h2>Categories</h2>
            <div className="categories-checklist-container">
              {categories.length === 0 ? (
                <span className="uploader-hint">No categories registered.</span>
              ) : (
                categories.map((cat) => (
                  <label key={cat.id} className="category-check-item">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => handleCategoryToggle(cat.id)}
                      disabled={isSubmitting}
                    />
                    <span>{cat.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Card: Homepage Controls (Admin Only) */}
          {isAdmin && (
            <div className="editor-card">
              <h2>Homepage Controls</h2>

              <div className="editor-form-group">
                <label htmlFor="hero_position">Hero Placement</label>
                <select id="hero_position" {...register('hero_position')} disabled={isSubmitting}>
                  <option value="none">None</option>
                  <option value="primary">Primary Hero</option>
                  <option value="secondary">Secondary Hero</option>
                </select>
                <p className="uploader-hint" style={{ marginTop: '2px' }}>
                  Only applies if status is Published.
                </p>
              </div>

              <div className="editor-form-group">
                <label htmlFor="featured_until">Featured Until</label>
                <input
                  id="featured_until"
                  type="date"
                  {...register('featured_until')}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* Card: SEO Metadata */}
          <div className="editor-card">
            <h2>SEO Metadata</h2>

            <div className="editor-form-group">
              <label htmlFor="seo_title">SEO Title</label>
              <input
                id="seo_title"
                type="text"
                {...register('seo_title')}
                placeholder="Fallback: title"
                disabled={isSubmitting}
              />
            </div>

            <div className="editor-form-group">
              <label htmlFor="seo_description">SEO Description</label>
              <textarea
                id="seo_description"
                rows="3"
                {...register('seo_description')}
                placeholder="Fallback: excerpt"
                disabled={isSubmitting}
              ></textarea>
            </div>
          </div>
        </div>

        {/* Action Panel Footer across bottom */}
        <div className="editor-card" style={{ gridColumn: '1 / -1', padding: '16px 24px' }}>
          <div className="editor-action-footer">
            <div className="action-left">
              {/* Save Draft */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="editor-btn save-draft"
              >
                <Save size={16} />
                <span>Save Draft</span>
              </button>

              {/* Submit for Review */}
              <button
                type="button"
                onClick={handleSubmit(onSubmitReview)}
                disabled={isSubmitting}
                className="editor-btn submit-review"
              >
                <FileCheck size={16} />
                <span>Submit for Review</span>
              </button>

              {/* Publish (Admin Only) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSubmit(onPublish)}
                  disabled={isSubmitting}
                  className="editor-btn publish"
                >
                  <CheckCircle2 size={16} />
                  <span>Publish Now</span>
                </button>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={handleCancelClick}
                className="edit-action-btn"
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
