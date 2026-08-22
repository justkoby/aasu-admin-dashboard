import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { postSchema } from '../utils/validationSchemas'
import { createSlug } from '../utils/createSlug'
import FeaturedImageUploader from '../components/posts/FeaturedImageUploader'
import PostGalleryManager from '../components/posts/PostGalleryManager'
import RichTextEditor from '../components/posts/RichTextEditor'
import SubmissionModal from '../components/posts/SubmissionModal'
import TrashConfirmModal from '../components/posts/TrashConfirmModal'
import { canTrashPost } from '../components/posts/PostActionsMenu'
import { formatRole } from '../utils/formatRole'
import {
  Save,
  FileCheck,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  Lock,
  ShieldAlert,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
  Trash2
} from 'lucide-react'
import '../styles/posts.css'

// Internal diagnostic logger — surfaces complete Supabase error context in dev console
const logSaveError = (operation, err, payload = {}) => {
  console.error(`[AASU CMS Error] ${operation} failed:`, {
    operation,
    code: err?.code ?? null,
    message: err?.message ?? null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    payload
  })
}

export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditMode = Boolean(id)

  const { user, profile, loading: authLoading } = useAuth()
  const userRole = (profile?.role || '').toLowerCase()

  // Explicit role booleans
  const isSuperAdmin = userRole === 'super_admin'
  const isCommunicationsAdmin = userRole === 'communications_admin'
  const isSupervisor = userRole === 'supervisor'
  const isContributor = userRole === 'contributor'

  const canPublishDirectly = isSuperAdmin || isCommunicationsAdmin || isSupervisor
  const canManageHero = isSuperAdmin || isCommunicationsAdmin

  // Component States
  const [categories, setCategories] = useState([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [originalPost, setOriginalPost] = useState(null)
  const [postLoaded, setPostLoaded] = useState(!isEditMode)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // Editorial feedback notes attached to a returned draft
  const [reviewNotes, setReviewNotes] = useState([])
  const [showFeedbackHistory, setShowFeedbackHistory] = useState(false)

  // Contributor submission confirmation modal (optional note to the reviewer)
  const [pendingSubmission, setPendingSubmission] = useState(null)
  const [submissionNote, setSubmissionNote] = useState('')

  // Supervisor assignment for contributor submission
  const [supervisors, setSupervisors] = useState([])
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('')
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(false)

  const [isLoading, setIsLoading] = useState(isEditMode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [galleryImages, setGalleryImages] = useState([])

  // React Hook Form initialization
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      featured_image_url: '',
      featured_image_alt: '',
      type: 'news',
      region: '',
      theme: '',
      hero_position: 'none',
      featured_until: '',
      seo_title: '',
      seo_description: '',
      reference_number: '',
      external_url: '',
      redirect_url: ''
    }
  })

  const watchTitle = watch('title')

  // Auto-generate URL slug from Title on initial post creation
  useEffect(() => {
    if (!isEditMode && watchTitle) {
      setValue('slug', createSlug(watchTitle), { shouldValidate: true })
    }
  }, [watchTitle, isEditMode, setValue])

  // Load Categories & (if Edit Mode) Post Details & Review Notes
  useEffect(() => {
    if (authLoading) return
    let isMounted = true

    async function loadData() {
      if (isEditMode) {
        setIsLoading(true)
        setPostLoaded(false)
        setPermissionDenied(false)
      }

      try {
        // 1. Fetch Categories
        let { data: catData, error: catErr } = await supabase
          .from('categories')
          .select('id, name, is_active')
          .order('name', { ascending: true })

        if (catErr && catErr.code === '42703') {
          const fallbackRes = await supabase
            .from('categories')
            .select('id, name')
            .order('name', { ascending: true })
          catData = fallbackRes.data
          catErr = fallbackRes.error
        }

        if (catErr) {
          logSaveError('categories.select', catErr)
        } else if (isMounted && catData) {
          setCategories(catData)
        }

        // 2. Fetch Post Record if Edit Mode
        if (isEditMode) {
          const { data: postData, error: postErr } = await supabase
            .from('posts')
            .select('*')
            .eq('id', id)
            .single()

          if (postErr) {
            console.error('[AASU CMS Post Fetch Error]', {
              code: postErr.code ?? null,
              message: postErr.message ?? null,
              details: postErr.details ?? null,
              hint: postErr.hint ?? null,
              postId: id,
              errorObj: postErr
            })
            throw postErr
          }

          if (import.meta.env.DEV && postData) {
            console.log('[AASU CMS Post Fetch Diagnostics]', {
              postId: postData.id,
              hasContent: Boolean(postData.content),
              contentLength: postData.content ? postData.content.length : 0,
              hasFeaturedImage: Boolean(postData.featured_image_url),
              featuredImageUrl: postData.featured_image_url || null,
              authorId: postData.author_id,
              status: postData.status
            })
          }

          if (isMounted && postData) {
            // Authorization verification for edit mode
            let isAuthorizedToEdit = false

            if (isSuperAdmin || isCommunicationsAdmin) {
              isAuthorizedToEdit = true
            } else if (isSupervisor) {
              if (postData.author_id === user.id || postData.assigned_reviewer_id === user.id) {
                isAuthorizedToEdit = true
              } else {
                // Check if an active supervisor assignment exists
                const { data: assignment } = await supabase
                  .from('supervisor_assignments')
                  .select('id')
                  .eq('supervisor_id', user.id)
                  .eq('contributor_id', postData.author_id)
                  .eq('is_active', true)
                  .maybeSingle()
                if (assignment) {
                  isAuthorizedToEdit = true
                }
              }
            } else if (isContributor) {
              if (postData.author_id === user.id) {
                isAuthorizedToEdit = true
              }
            }

            if (!isAuthorizedToEdit) {
              setPermissionDenied(true)
              setIsLoading(false)
              return
            }

            setOriginalPost(postData)

            // Populate form fields with existing post values
            reset({
              title: postData.title || '',
              slug: postData.slug || '',
              excerpt: postData.excerpt || '',
              content: postData.content || '',
              featured_image_url: postData.featured_image_url || '',
              featured_image_alt: postData.featured_image_alt || '',
              type: postData.type || 'news',
              region: postData.region || '',
              theme: postData.theme || '',
              hero_position: postData.hero_position || 'none',
              featured_until: postData.featured_until
                ? postData.featured_until.split('T')[0]
                : '',
              seo_title: postData.seo_title || '',
              seo_description: postData.seo_description || '',
              reference_number: postData.reference_number || '',
              external_url: postData.external_url || '',
              redirect_url: postData.redirect_url || ''
            })

            // Fetch attached Gallery Images
            try {
              const { data: gData } = await supabase
                .from('post_gallery_images')
                .select('*')
                .eq('post_id', id)
                .order('sort_order', { ascending: true })
              if (isMounted && gData) setGalleryImages(gData)
            } catch (gErr) {
              console.warn('Gallery images fetch warning:', gErr)
            }

            setPostLoaded(true)

            // Fetch attached Category IDs
            const { data: pcData, error: pcErr } = await supabase
              .from('post_categories')
              .select('category_id')
              .eq('post_id', id)

            if (pcErr) {
              logSaveError('post_categories.select', pcErr, { id })
            } else if (isMounted && pcData) {
              setSelectedCategoryIds(pcData.map((item) => item.category_id))
            }

            // Fetch attached Review Notes
            try {
              let notesResult = await supabase
                .from('review_notes')
                .select('*, author:profiles!review_notes_author_id_fkey(full_name, email, role)')
                .eq('post_id', id)
                .order('created_at', { ascending: false })

              if (notesResult.error) {
                notesResult = await supabase
                  .from('review_notes')
                  .select('*')
                  .eq('post_id', id)
                  .order('created_at', { ascending: false })
              }

              if (isMounted && notesResult.data) {
                setReviewNotes(notesResult.data)
              }
            } catch (notesErr) {
              console.warn('Could not load review notes for draft editor:', notesErr)
            }
          }
        }
      } catch (err) {
        console.error('Error initializing post editor:', err)
        if (isMounted) {
          setSaveStatus({
            type: 'error',
            message: 'Failed to load post details for editing. Please check your connection.'
          })
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [id, isEditMode, reset, authLoading, user, isSuperAdmin, isCommunicationsAdmin, isSupervisor, isContributor])

  // Category selection handler
  const handleCategoryToggle = (categoryId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((catId) => catId !== categoryId)
        : [...prev, categoryId]
    )
  }

  // Cancel edit/create — return to posts page safely
  const handleCancelClick = () => {
    const targetRoute = isSupervisor ? '/dashboard/team-posts' : '/dashboard/posts'
    navigate(targetRoute)
  }

  // Common Post Saving Logic
  const handleSavePost = async (formValues, statusAction, contributorNote = null, assignedReviewerId = null) => {
    if (isEditMode && (!postLoaded || isLoading)) {
      setSaveStatus({
        type: 'error',
        message: 'Please wait for the post data to finish loading before saving.'
      })
      return false
    }

    // Safety Protection: Never replace non-empty stored content with empty value caused by hydration failure
    if (
      isEditMode &&
      originalPost?.content &&
      (!formValues.content || formValues.content.trim() === '' || formValues.content === '<p></p>')
    ) {
      setSaveStatus({
        type: 'error',
        message: 'Content hydration check failed. Existing article content cannot be overwritten with an empty value.'
      })
      return false
    }

    setIsSubmitting(true)
    setSaveStatus(null)

    const isContributorSubmit = isContributor && statusAction === 'submit'
    const isSupervisorPublish = isSupervisor && statusAction === 'publish'

    try {
      const currentSlug = formValues.slug.toLowerCase().trim()

      // 1. Slug collision check
      let query = supabase.from('posts').select('id').eq('slug', currentSlug)
      if (isEditMode) {
        query = query.neq('id', id)
      }
      
      const { data: duplicatePost, error: checkErr } = await query.maybeSingle()
      if (checkErr) {
        logSaveError('posts.select (slug collision check)', checkErr, { slug: currentSlug })
        throw checkErr
      }

      if (duplicatePost) {
        throw new Error(
          'Slug collision detected. The URL slug already exists. Please choose a different slug or title.'
        )
      }

      // Resolve live authenticated user
      const { data: authSession } = await supabase.auth.getSession()
      const authenticatedUser = authSession?.session?.user || user
      if (!authenticatedUser?.id) {
        throw new Error('Your session has expired. Please sign in again to save posts.')
      }

      // 2. Build Database columns payload
      const contentFields = {
        title: formValues.title,
        slug: currentSlug,
        excerpt: formValues.excerpt,
        content: formValues.content,
        featured_image_url: formValues.featured_image_url,
        featured_image_alt: formValues.featured_image_alt,
        type: formValues.type,
        region: formValues.region || null,
        theme: formValues.theme || null,
        seo_title: formValues.seo_title || null,
        seo_description: formValues.seo_description || null,
        reference_number: formValues.reference_number || null,
        external_url: formValues.external_url || null,
        redirect_url: formValues.redirect_url || null
      }

      let payload
      if (!isEditMode) {
        payload = {
          ...contentFields,
          author_id: authenticatedUser.id,
          status: 'draft',
          hero_position: 'none',
          featured_until: null,
          published_at: null,
          submitted_at: null,
          scheduled_for: null,
          reviewed_by: null,
          reviewed_at: null,
          assigned_reviewer_id: null
        }

        if (canManageHero) {
          payload.hero_position = formValues.hero_position || 'none'
          payload.featured_until = formValues.featured_until || null
          if (statusAction === 'publish') {
            payload.status = 'published'
            payload.published_at = new Date().toISOString()
            payload.reviewed_by = authenticatedUser.id
            payload.reviewed_at = new Date().toISOString()
          } else if (statusAction === 'submit') {
            payload.status = 'in_review'
            payload.submitted_at = new Date().toISOString()
          }
        }

        if (payload.author_id !== authenticatedUser.id) {
          throw new Error('Author verification failed. The post author must be the signed-in user.')
        }

        payload = Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined)
        )
      } else {
        payload = {
          ...contentFields,
          author_id: originalPost.author_id
        }

        if (canManageHero) {
          payload.hero_position = formValues.hero_position || 'none'
          payload.featured_until = formValues.featured_until || null
        } else {
          payload.hero_position = 'none'
          payload.featured_until = null
        }

        if (statusAction === 'publish') {
          payload.status = 'published'
          payload.published_at = originalPost?.published_at || new Date().toISOString()
          payload.reviewed_by = authenticatedUser.id
          payload.reviewed_at = new Date().toISOString()
          payload.assigned_reviewer_id = null
        } else if (statusAction === 'submit') {
          payload.status = 'in_review'
          payload.submitted_at = new Date().toISOString()
          payload.hero_position = 'none'
          payload.published_at = null
          payload.reviewed_by = null
          payload.reviewed_at = null
          if (assignedReviewerId) {
            payload.assigned_reviewer_id = assignedReviewerId
          }
        } else {
          // draft — default save action
          payload.status = originalPost?.status === 'published' ? 'published' : 'draft'
        }
      }

      // 3. Upsert Post Record
      let savedPost = null
      let publicationFailedAfterDraft = false
      let submissionFailedAfterDraft = false

      if (isEditMode) {
        let updateQuery = supabase.from('posts').update(payload).eq('id', id)
        if (isContributor) {
          updateQuery = updateQuery.eq('author_id', authenticatedUser.id)
        }
        const { data, error: updateErr } = await updateQuery.select().single()

        if (updateErr) {
          console.error({
            code: updateErr.code,
            message: updateErr.message,
            details: updateErr.details,
            hint: updateErr.hint,
            payload
          })
          throw updateErr
        }
        savedPost = data
      } else {
        const { data, error: insertErr } = await supabase
          .from('posts')
          .insert(payload)
          .select()
          .single()
        
        if (insertErr) {
          console.error({
            code: insertErr.code,
            message: insertErr.message,
            details: insertErr.details,
            hint: insertErr.hint,
            payload
          })
          throw insertErr
        }
        savedPost = data
      }

      // Supervisor Publish on New Creation
      if (!isEditMode && isSupervisorPublish) {
        const publishUpdate = {
          status: 'published',
          published_at: new Date().toISOString(),
          reviewed_by: authenticatedUser.id,
          reviewed_at: new Date().toISOString(),
          hero_position: 'none',
          assigned_reviewer_id: null
        }

        const { data: pubData, error: pubErr } = await supabase
          .from('posts')
          .update(publishUpdate)
          .eq('id', savedPost.id)
          .select()
          .single()

        if (pubErr) {
          console.error('[AASU CMS] Supervisor publish update failed:', pubErr)
          publicationFailedAfterDraft = true
        } else if (pubData) {
          savedPost = pubData
        }
      }

      // Contributor Submission on New Creation
      if (!isEditMode && isContributorSubmit) {
        const submissionUpdate = {
          status: 'in_review',
          submitted_at: new Date().toISOString(),
          hero_position: 'none',
          published_at: null,
          reviewed_by: null,
          reviewed_at: null
        }
        if (assignedReviewerId) {
          submissionUpdate.assigned_reviewer_id = assignedReviewerId
        }
        const { error: submitUpdateErr } = await supabase
          .from('posts')
          .update(submissionUpdate)
          .eq('id', savedPost.id)
          .eq('author_id', authenticatedUser.id)

        if (submitUpdateErr) {
          console.error('[AASU CMS] Contributor submission update failed:', submitUpdateErr)
          submissionFailedAfterDraft = true
        }
      }

      // Optional contributor submission note
      let noteFailed = false
      const trimmedSubmissionNote = (contributorNote || '').trim()
      if (isContributorSubmit && !submissionFailedAfterDraft && trimmedSubmissionNote) {
        try {
          const { data: existingNote } = await supabase
            .from('review_notes')
            .select('id')
            .eq('post_id', savedPost.id)
            .eq('author_id', authenticatedUser.id)
            .eq('note_type', 'contributor_note')
            .eq('note', trimmedSubmissionNote)
            .maybeSingle()

          if (!existingNote) {
            const { error: noteErr } = await supabase.from('review_notes').insert({
              post_id: savedPost.id,
              author_id: authenticatedUser.id,
              note: trimmedSubmissionNote,
              note_type: 'contributor_note'
            })
            if (noteErr) throw noteErr
          }
        } catch (noteErr) {
          console.error('[AASU CMS] Contributor submission note could not be attached.', noteErr)
          noteFailed = true
        }
      }

      // 4. Save Category Assignments safely
      let categoryAssignmentSuccess = true
      try {
        const { error: clearErr } = await supabase
          .from('post_categories')
          .delete()
          .eq('post_id', savedPost.id)
        
        if (clearErr) throw clearErr

        if (selectedCategoryIds.length > 0) {
          const mappings = selectedCategoryIds.map((catId) => ({
            post_id: savedPost.id,
            category_id: catId
          }))
          const { error: mapErr } = await supabase.from('post_categories').insert(mappings)
          if (mapErr) throw mapErr
        }
      } catch (catErr) {
        logSaveError('post_categories.delete/insert (category assignment)', catErr, {
          post_id: savedPost?.id ?? null,
          category_ids: selectedCategoryIds
        })
        categoryAssignmentSuccess = false
      }

      // 4b. Save Gallery Images safely
      try {
        await supabase.from('post_gallery_images').delete().eq('post_id', savedPost.id)
        if (galleryImages.length > 0) {
          const galleryPayload = galleryImages.map((img, idx) => ({
            post_id: savedPost.id,
            media_asset_id: img.media_asset_id || null,
            image_url: img.image_url,
            storage_path: img.storage_path || null,
            alt_text: img.alt_text || null,
            caption: img.caption || null,
            sort_order: idx
          }))
          const { error: gErr } = await supabase.from('post_gallery_images').insert(galleryPayload)
          if (gErr) logSaveError('post_gallery_images.insert', gErr, { post_id: savedPost.id })
        }
      } catch (gErr) {
        console.warn('Post gallery images save warning:', gErr)
      }

      // 5. Report save state & Navigation
      const targetListRoute = isSupervisor ? '/dashboard/team-posts' : '/dashboard/posts'

      if (publicationFailedAfterDraft) {
        navigate(`/dashboard/posts/${savedPost.id}/edit`, {
          state: {
            type: 'warning',
            message: 'Your post was saved as a draft, but it could not be published.'
          }
        })
      } else if (submissionFailedAfterDraft) {
        navigate(`/dashboard/posts/${savedPost.id}/edit`, {
          state: {
            type: 'warning',
            message: 'Your post was saved as a draft, but it could not be submitted for review.'
          }
        })
      } else if (statusAction === 'publish') {
        navigate(targetListRoute, {
          state: { type: 'success', message: 'Published successfully' }
        })
      } else if (isContributorSubmit) {
        navigate('/dashboard/posts', {
          state: noteFailed
            ? {
                type: 'warning',
                message: 'Your post was submitted, but the note could not be attached.'
              }
            : { type: 'success', message: 'Submitted for review successfully' }
        })
      } else {
        navigate(targetListRoute, {
          state: { type: 'success', message: 'Saved as draft' }
        })
      }
      return true
    } catch (err) {
      console.error('Post save failed:', err)

      const isNetworkErr =
        err.message?.toLowerCase().includes('failed to fetch') ||
        err.message?.toLowerCase().includes('networkerror')
      const isSlugConflict = err.message?.toLowerCase().includes('slug')

      let friendlyMessage =
        'An unexpected error occurred while saving the post. Please try again.'
      if (isNetworkErr) {
        friendlyMessage = 'Network error. Please check your internet connection and try again.'
      } else if (isSlugConflict) {
        friendlyMessage = err.message
      }

      setSaveStatus({ type: 'error', message: friendlyMessage })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler for Save Draft
  const onSaveDraft = async (formValues) => {
    await handleSavePost(formValues, 'draft')
  }

  // Handler for Submit Review (Contributor Only)
  const onSubmitReview = async (formValues) => {
    setIsLoadingSupervisors(true)
    setSubmissionNote('')
    setPendingSubmission(formValues)
    try {
      const { data: assignments, error: assErr } = await supabase
        .from('supervisor_assignments')
        .select('supervisor_id, supervisor:profiles!supervisor_assignments_supervisor_id_fkey(id, full_name, email)')
        .eq('contributor_id', user.id)
        .eq('is_active', true)

      if (!assErr && assignments) {
        const svs = assignments
          .map(a => a.supervisor)
          .filter(Boolean)
        setSupervisors(svs)
        if (svs.length === 1) {
          setSelectedSupervisorId(svs[0].id)
        } else if (isEditMode && originalPost?.assigned_reviewer_id) {
          const stillActive = svs.find(s => s.id === originalPost.assigned_reviewer_id)
          setSelectedSupervisorId(stillActive ? originalPost.assigned_reviewer_id : '')
        } else {
          setSelectedSupervisorId('')
        }
      } else {
        setSupervisors([])
        setSelectedSupervisorId('')
      }
    } catch (e) {
      console.warn('Supervisor assignment lookup failed:', e)
      setSupervisors([])
      setSelectedSupervisorId('')
    } finally {
      setIsLoadingSupervisors(false)
    }
  }

  // Modal confirmation for contributor submission
  const handleConfirmSubmission = async () => {
    const formValues = pendingSubmission
    const success = await handleSavePost(formValues, 'submit', submissionNote, selectedSupervisorId)
    if (success) {
      setPendingSubmission(null)
    }
  }

  // Handler for Publish Now (Super Admin, Comms Admin, or Supervisor)
  const onPublish = async (formValues) => {
    const confirm = window.confirm(
      'Publish this post now? It will become visible on the AASU website.'
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

  if (permissionDenied) {
    return (
      <div className="dashboard-content-wrapper">
        <div className="error-state">
          <ShieldAlert size={48} className="error-state-icon" style={{ color: 'var(--dash-gold)' }} />
          <h3>Access Restricted</h3>
          <p>
            {isSupervisor
              ? 'You do not have permission to edit this post because it is not assigned to you.'
              : 'You can only edit your own posts.'}
          </p>
          <button
            type="button"
            className="retry-btn"
            onClick={() => navigate(isSupervisor ? '/dashboard/team-posts' : '/dashboard/posts')}
          >
            <ArrowLeft size={16} />
            <span>{isSupervisor ? 'Back to Team Posts' : 'Back to My Posts'}</span>
          </button>
        </div>
      </div>
    )
  }

  // Contributors cannot modify a post while it awaits editorial review
  if (isEditMode && isContributor && originalPost?.status === 'in_review') {
    return (
      <div className="dashboard-content-wrapper">
        <div
          className="editor-card"
          style={{ maxWidth: '640px', margin: '40px auto', padding: '40px 32px', textAlign: 'center' }}
        >
          <Lock size={40} style={{ color: 'var(--posts-red)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--dash-navy)', marginBottom: '8px' }}>
            Awaiting Review
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--dash-text-secondary)',
              lineHeight: 1.6,
              marginBottom: '24px'
            }}
          >
            This post has been submitted for review and is locked for editing. You will be able
            to revise it again once a reviewer returns it to draft.
          </p>
          <button type="button" className="edit-action-btn" onClick={() => navigate('/dashboard/posts')}>
            <ArrowLeft size={14} />
            <span>Back to My Posts</span>
          </button>
        </div>
      </div>
    )
  }

  const latestOwnNote = reviewNotes.find((n) => (n.note_type || 'reviewer_feedback') === 'contributor_note')
  const latestReviewerNote = reviewNotes.find((n) => (n.note_type || 'reviewer_feedback') === 'reviewer_feedback')
  const olderNotes = reviewNotes.slice(1)

  // Trash handling state
  const [postToTrash, setPostToTrash] = useState(null)
  const [isTrashing, setIsTrashing] = useState(false)
  const [trashError, setTrashError] = useState(null)

  const handleConfirmTrash = async (post) => {
    setIsTrashing(true)
    setTrashError(null)
    try {
      let trashedRow = null
      const { data: rpcData, error: rpcErr } = await supabase.rpc('trash_post', {
        p_post_id: post.id
      })

      if (rpcErr) {
        console.warn('trash_post RPC fallback:', rpcErr)
        const { data: updateData, error: updateErr } = await supabase
          .from('posts')
          .update({
            status_before_delete: post.status,
            status: 'archived',
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            hero_position: 'none',
            featured_until: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id)
          .select('id, title')
          .single()

        if (updateErr) throw updateErr
        trashedRow = updateData
      } else {
        trashedRow = rpcData
      }

      setPostToTrash(null)
      const targetRoute = isSupervisor ? '/dashboard/team-posts' : '/dashboard/posts'
      navigate(targetRoute, {
        state: { type: 'success', message: `Moved ‘${post.title || 'Untitled'}’ to Trash successfully.` }
      })
    } catch (err) {
      console.error('Error moving post to trash:', err)
      setTrashError(err)
    } finally {
      setIsTrashing(false)
    }
  }

  const canTrashCurrentPost = isEditMode && originalPost && canTrashPost(userRole, user?.id, originalPost, [])

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
            <span>{isSupervisor ? 'Back to Team Posts' : 'Back to Posts'}</span>
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
            <MessageSquareText size={20} className="editor-feedback-icon" />
            <div>
              <h3>Editorial Feedback & Notes</h3>
              <p>Review feedback attached to this post during editorial review.</p>
            </div>
          </div>

          {/* Primary highlight note */}
          {latestReviewerNote ? (
            <div className="editor-feedback-note-block reviewer">
              <span className="editor-feedback-note-author">
                {latestReviewerNote.author?.full_name || latestReviewerNote.author?.email || 'Reviewer'}
                {latestReviewerNote.author?.role && (
                  <span className="editor-feedback-role">
                    {' · '}
                    {formatRole(latestReviewerNote.author.role)}
                  </span>
                )}
              </span>
              <p className="editor-feedback-note-text">{latestReviewerNote.note}</p>
            </div>
          ) : latestOwnNote ? (
            <div className="editor-feedback-note-block contributor">
              <span className="editor-feedback-note-author">Your Submission Note</span>
              <p className="editor-feedback-note-text">{latestOwnNote.note}</p>
            </div>
          ) : null}

          {/* Expandable History */}
          {olderNotes.length > 0 && (
            <div className="editor-feedback-history-toggle">
              <button
                type="button"
                className="history-toggle-btn"
                onClick={() => setShowFeedbackHistory(!showFeedbackHistory)}
              >
                <span>{showFeedbackHistory ? 'Hide note history' : `View note history (${olderNotes.length})`}</span>
                {showFeedbackHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showFeedbackHistory && (
                <div className="editor-feedback-history-list">
                  {olderNotes.map((note) => {
                    const isContrib = (note.note_type || 'reviewer_feedback') === 'contributor_note'
                    return (
                      <div
                        key={note.id}
                        className={`editor-feedback-history-item ${isContrib ? 'contributor' : 'reviewer'}`}
                      >
                        <span className="editor-feedback-note-author">
                          {isContrib
                            ? 'Contributor note'
                            : note.author?.full_name || note.author?.email || 'Reviewer'}
                        </span>
                        <p className="editor-feedback-note-text">{note.note}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Post Editor Form */}
      <form onSubmit={handleSubmit(onSaveDraft)} className="post-editor-form">
        <div className="editor-grid-layout">
          {/* ---------------- Left: Main Content Column ---------------- */}
          <div className="editor-main-panel">
            {/* Card: Title */}
            <div className="editor-card">
              <div className="editor-form-group">
                <label htmlFor="title">
                  Title <span className="required-star">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  {...register('title')}
                  placeholder="Enter a descriptive post title..."
                  disabled={isSubmitting}
                  className={errors.title ? 'has-error' : ''}
                />
                {errors.title && (
                  <span className="validation-error-text">{errors.title.message}</span>
                )}
              </div>
            </div>

            {/* Card: Article Content */}
            <div className="editor-card">
              <div className="editor-form-group">
                <label htmlFor="content">
                  Article Content <span className="required-star">*</span>
                </label>
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) => (
                    <RichTextEditor
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.content && (
                  <span className="validation-error-text">{errors.content.message}</span>
                )}
              </div>
            </div>

            {/* Card: Excerpt */}
            <div className="editor-card">
              <div className="editor-form-group">
                <label htmlFor="excerpt">Article Excerpt</label>
                <textarea
                  id="excerpt"
                  rows="3"
                  {...register('excerpt')}
                  placeholder="Summarize the core story in 1-2 sentences for card listings..."
                  disabled={isSubmitting}
                  className={errors.excerpt ? 'has-error' : ''}
                ></textarea>
                {errors.excerpt && (
                  <span className="validation-error-text">{errors.excerpt.message}</span>
                )}
              </div>
            </div>

            {/* Card: Additional Gallery Images */}
            <div className="editor-card">
              <PostGalleryManager
                galleryImages={galleryImages}
                onChangeGalleryImages={setGalleryImages}
              />
            </div>
          </div>

          {/* ---------------- Right: Metadata & Settings Column ---------------- */}
          <div className="editor-settings-sidebar">
            {/* Card: Featured Image */}
            <div className="editor-card">
              <h2>Featured Image</h2>
              <FeaturedImageUploader
                url={watch('featured_image_url')}
                onChangeUrl={(url) => setValue('featured_image_url', url, { shouldValidate: true })}
                alt={watch('featured_image_alt')}
                onChangeAlt={(alt) => setValue('featured_image_alt', alt, { shouldValidate: true })}
                userId={user?.id}
                errorUrl={errors.featured_image_url}
                errorAlt={errors.featured_image_alt}
              />
            </div>

            {/* Card: General Settings */}
            <div className="editor-card">
              <h2>Post Attributes</h2>

              {/* URL Slug */}
              <div className="editor-form-group">
                <label htmlFor="slug">
                  URL Slug <span className="required-star">*</span>
                </label>
                <input
                  id="slug"
                  type="text"
                  {...register('slug')}
                  placeholder="post-url-slug"
                  disabled={isSubmitting}
                  className={errors.slug ? 'has-error' : ''}
                />
                {errors.slug && (
                  <span className="validation-error-text">{errors.slug.message}</span>
                )}
              </div>

              {/* Post Type */}
              <div className="editor-form-group">
                <label htmlFor="type">Post Type</label>
                <select id="type" {...register('type')} disabled={isSubmitting}>
                  <option value="news">News Report</option>
                  <option value="blog">Blog Insight</option>
                  <option value="event">Event</option>
                  <option value="press_release">Press Release</option>
                  <option value="readout">Readout / Communiqué</option>
                </select>
              </div>

              {/* Reference Number (Press Release / Readout / Event) */}
              {['press_release', 'readout', 'event'].includes((watch('type') || '').toLowerCase()) && (
                <div className="editor-form-group">
                  <label htmlFor="reference_number">Official Reference Number</label>
                  <input
                    id="reference_number"
                    type="text"
                    {...register('reference_number')}
                    placeholder="e.g. AASU/PR/2026/04"
                    disabled={isSubmitting}
                  />
                  <p className="uploader-hint" style={{ marginTop: '2px' }}>
                    Official document reference code.
                  </p>
                </div>
              )}

              {/* External URL */}
              <div className="editor-form-group">
                <label htmlFor="external_url">
                  {(watch('type') || '').toLowerCase() === 'event'
                    ? 'Event Registration / Platform Link'
                    : 'External Resource / Article Link'}
                </label>
                <input
                  id="external_url"
                  type="url"
                  {...register('external_url')}
                  placeholder="https://..."
                  disabled={isSubmitting}
                />
              </div>

              {/* Redirect URL (Admin-Only Advanced Routing Override) */}
              {canManageHero && (
                <div className="editor-form-group">
                  <label htmlFor="redirect_url" style={{ color: 'var(--posts-red)', fontWeight: 700 }}>
                    Redirect URL (Advanced Override)
                  </label>
                  <input
                    id="redirect_url"
                    type="text"
                    {...register('redirect_url')}
                    placeholder="/events/special-page or https://..."
                    disabled={isSubmitting}
                  />
                  <p className="uploader-hint" style={{ marginTop: '2px', color: '#cb3631' }}>
                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    Warning: Entering a value will bypass normal article page rendering and redirect site visitors.
                  </p>
                </div>
              )}

              {/* Regional Focus */}
              <div className="editor-form-group">
                <label htmlFor="region">Regional Focus</label>
                <select id="region" {...register('region')} disabled={isSubmitting}>
                  <option value="">None / Regional</option>
                  <option value="West Africa">West Africa</option>
                  <option value="East Africa">East Africa</option>
                  <option value="Central Africa">Central Africa</option>
                  <option value="Southern Africa">Southern Africa</option>
                  <option value="North Africa">North Africa</option>
                  <option value="Diaspora">Diaspora</option>
                </select>
              </div>

              {/* Thematic Focus */}
              <div className="editor-form-group">
                <label htmlFor="theme">Thematic Focus</label>
                <Controller
                  name="theme"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="theme"
                      type="text"
                      {...field}
                      placeholder="e.g. Student Leadership, Education Policy"
                      disabled={isSubmitting}
                    />
                  )}
                />
              </div>
            </div>

            {/* Card: Categories */}
            <div className="editor-card">
              <h2>Categories</h2>
              <div className="categories-checklist-container">
                {categories.filter(cat => cat.is_active !== false || selectedCategoryIds.includes(cat.id)).length === 0 ? (
                  <span className="uploader-hint">No active categories available.</span>
                ) : (
                  categories
                    .filter(cat => cat.is_active !== false || selectedCategoryIds.includes(cat.id))
                    .map((cat) => (
                      <label key={cat.id} className="category-check-item">
                        <input
                          type="checkbox"
                          checked={selectedCategoryIds.includes(cat.id)}
                          onChange={() => handleCategoryToggle(cat.id)}
                          disabled={isSubmitting}
                        />
                        <span>{cat.name}{cat.is_active === false ? ' (Inactive)' : ''}</span>
                      </label>
                    ))
                )}
              </div>
            </div>

            {/* Card: Homepage Controls (Super Admin & Comms Admin Only) */}
            {canManageHero && (
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

                {/* Submit for Review (Contributor Only) */}
                {isContributor && (
                  <button
                    type="button"
                    onClick={handleSubmit(onSubmitReview)}
                    disabled={isSubmitting}
                    className="editor-btn submit-review"
                  >
                    <FileCheck size={16} />
                    <span>Submit for Review</span>
                  </button>
                )}

                {/* Publish Now (Super Admin, Comms Admin, or Supervisor) */}
                {canPublishDirectly && (
                  <button
                    type="button"
                    onClick={handleSubmit(onPublish)}
                    disabled={isSubmitting}
                    className="editor-btn publish"
                  >
                    <CheckCircle2 size={16} />
                    <span>{isEditMode && originalPost?.status === 'published' ? 'Publish Changes' : 'Publish Now'}</span>
                  </button>
                )}

                {/* Move to Trash Button */}
                {canTrashCurrentPost && (
                  <button
                    type="button"
                    onClick={() => setPostToTrash(originalPost)}
                    disabled={isSubmitting}
                    className="editor-btn danger"
                    style={{
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FCA5A5'
                    }}
                  >
                    <Trash2 size={16} />
                    <span>Move to Trash</span>
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
        </div>
      </form>

      {/* Contributor submission confirmation modal */}
      {pendingSubmission && (
        <SubmissionModal
          note={submissionNote}
          onNoteChange={setSubmissionNote}
          supervisors={supervisors}
          selectedSupervisorId={selectedSupervisorId}
          onSupervisorChange={setSelectedSupervisorId}
          isLoadingSupervisors={isLoadingSupervisors}
          onCancel={() => setPendingSubmission(null)}
          onConfirm={handleConfirmSubmission}
          isSubmitting={isSubmitting}
          notice={saveStatus}
        />
      )}

      {/* Trash confirm modal */}
      {postToTrash && (
        <TrashConfirmModal
          post={postToTrash}
          onConfirm={handleConfirmTrash}
          onCancel={() => {
            setPostToTrash(null)
            setTrashError(null)
          }}
          isSubmitting={isTrashing}
          error={trashError}
        />
      )}
    </div>
  )
}

