-- Migration 008_post_trash_and_soft_delete.sql
-- Description: Security audited post soft delete, trash management, RLS policies, and activity logging.

BEGIN;

-- 1. Verify required core tables exist before proceeding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') THEN
    RAISE EXCEPTION 'Required table public.posts does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    RAISE EXCEPTION 'Required table public.profiles does not exist';
  END IF;
END $$;

-- 2. Add soft-delete columns to public.posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_before_delete TEXT NULL;

-- Add constraint to validate status_before_delete if present
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS chk_posts_status_before_delete;
ALTER TABLE public.posts
  ADD CONSTRAINT chk_posts_status_before_delete
  CHECK (status_before_delete IS NULL OR status_before_delete IN ('draft', 'in_review', 'published', 'archived', 'revision_requested', 'rejected'));

-- Indexes for performance on soft-deleted post queries
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON public.posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_by ON public.posts(deleted_by);

-- 3. Public Read Policies & Restrictive Policy Audit
-- A. Update Permissive Public Read Policy for Published Posts
DROP POLICY IF EXISTS "public_select_published_posts" ON public.posts;
CREATE POLICY "public_select_published_posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND published_at <= now()
  AND deleted_at IS NULL
);

-- B. Add RESTRICTIVE Policy for Anonymous Users (Guarantees deleted_at IS NULL is ALWAYS enforced regardless of permissive policies)
DROP POLICY IF EXISTS "anon_exclude_deleted_posts_restrictive" ON public.posts;
CREATE POLICY "anon_exclude_deleted_posts_restrictive"
ON public.posts
AS RESTRICTIVE
TO anon
USING (
  deleted_at IS NULL
);

-- C. Update Post Categories Public Read Policy
DROP POLICY IF EXISTS "public_select_post_categories" ON public.post_categories;
CREATE POLICY "public_select_post_categories"
ON public.post_categories
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_categories.post_id
      AND p.status = 'published'
      AND p.published_at <= now()
      AND p.deleted_at IS NULL
  )
);

-- D. Update Post Gallery Images Public Read Policy
DROP POLICY IF EXISTS "public_select_published_gallery_images" ON public.post_gallery_images;
CREATE POLICY "public_select_published_gallery_images"
ON public.post_gallery_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_gallery_images.post_id
      AND p.status = 'published'
      AND p.published_at <= now()
      AND p.deleted_at IS NULL
  )
);

-- 4. Authenticated User Policies for Posts Table

-- A. Authenticated SELECT Policy for Posts
DROP POLICY IF EXISTS "authenticated_select_posts" ON public.posts;
CREATE POLICY "authenticated_select_posts"
ON public.posts
FOR SELECT
TO authenticated
USING (
  -- Super Admin & Communications Admin see all posts (active and trashed)
  public.get_auth_user_role() IN ('super_admin', 'communications_admin')
  -- Supervisor sees own posts + assigned team posts (active and trashed)
  OR (
    public.get_auth_user_role() = 'supervisor' AND (
      author_id = auth.uid()
      OR assigned_reviewer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.supervisor_id = auth.uid()
          AND sa.contributor_id = posts.author_id
          AND sa.is_active = true
      )
    )
  )
  -- Contributor sees own posts (active and trashed drafts/returned)
  OR (
    public.get_auth_user_role() = 'contributor' AND author_id = auth.uid()
  )
);

-- B. Authenticated UPDATE Policy for Posts
DROP POLICY IF EXISTS "authenticated_update_posts" ON public.posts;
CREATE POLICY "authenticated_update_posts"
ON public.posts
FOR UPDATE
TO authenticated
USING (
  public.get_auth_user_role() IN ('super_admin', 'communications_admin')
  OR (
    public.get_auth_user_role() = 'supervisor' AND (
      author_id = auth.uid()
      OR assigned_reviewer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.supervisor_id = auth.uid()
          AND sa.contributor_id = posts.author_id
          AND sa.is_active = true
      )
    )
  )
  OR (
    public.get_auth_user_role() = 'contributor' AND author_id = auth.uid()
  )
)
WITH CHECK (
  public.get_auth_user_role() IN ('super_admin', 'communications_admin')
  OR (
    public.get_auth_user_role() = 'supervisor' AND (
      author_id = auth.uid()
      OR assigned_reviewer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.supervisor_id = auth.uid()
          AND sa.contributor_id = posts.author_id
          AND sa.is_active = true
      )
    )
  )
  OR (
    public.get_auth_user_role() = 'contributor' AND author_id = auth.uid()
  )
);

-- C. Hard DELETE Policy on Posts (Super Admin ONLY)
DROP POLICY IF EXISTS "super_admin_delete_posts" ON public.posts;
CREATE POLICY "super_admin_delete_posts"
ON public.posts
FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'super_admin'
);

-- 5. Audited SECURITY DEFINER Functions with Explicit Search Path & Actor Resolution

-- A. trash_post Function
CREATE OR REPLACE FUNCTION public.trash_post(p_post_id UUID)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_is_active BOOLEAN;
  v_post public.posts;
BEGIN
  -- Resolve actor exclusively through auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify active profile status
  SELECT role, COALESCE(is_active, true) INTO v_user_role, v_is_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'User profile is inactive or unauthorized';
  END IF;

  -- Fetch target post strictly (fails if 0 or >1 match)
  BEGIN
    SELECT * INTO STRICT v_post
    FROM public.posts
    WHERE id = p_post_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION 'Post with ID % not found', p_post_id;
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'Multiple posts matched ID %', p_post_id;
  END;

  IF v_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Post "%" is already in trash', v_post.title;
  END IF;

  -- Internal Role Permission Verification
  IF v_user_role = 'contributor' THEN
    IF v_post.author_id <> v_user_id THEN
      RAISE EXCEPTION 'Contributors can only trash their own posts';
    END IF;
    IF v_post.status IN ('in_review', 'published') THEN
      RAISE EXCEPTION 'Contributors cannot trash posts that are in review or published';
    END IF;
  ELSIF v_user_role = 'supervisor' THEN
    IF v_post.author_id <> v_user_id AND NOT EXISTS (
      SELECT 1 FROM public.supervisor_assignments sa
      WHERE sa.supervisor_id = v_user_id
        AND sa.contributor_id = v_post.author_id
        AND sa.is_active = true
    ) AND COALESCE(v_post.assigned_reviewer_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user_id THEN
      RAISE EXCEPTION 'Supervisors can only trash their own posts or posts belonging to active assigned contributors';
    END IF;
  ELSIF v_user_role NOT IN ('super_admin', 'communications_admin') THEN
    RAISE EXCEPTION 'Role "%" is not authorized to trash posts', v_user_role;
  END IF;

  -- Execute Soft Delete
  UPDATE public.posts
  SET status_before_delete = status,
      status = 'archived',
      deleted_at = now(),
      deleted_by = v_user_id,
      hero_position = 'none',
      featured_until = NULL,
      updated_at = now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

-- B. restore_post Function
CREATE OR REPLACE FUNCTION public.restore_post(p_post_id UUID)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_is_active BOOLEAN;
  v_post public.posts;
  v_target_status TEXT;
BEGIN
  -- Resolve actor exclusively through auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify active profile status
  SELECT role, COALESCE(is_active, true) INTO v_user_role, v_is_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'User profile is inactive or unauthorized';
  END IF;

  -- Fetch target post strictly
  BEGIN
    SELECT * INTO STRICT v_post
    FROM public.posts
    WHERE id = p_post_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION 'Post with ID % not found', p_post_id;
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'Multiple posts matched ID %', p_post_id;
  END;

  IF v_post.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Post "%" is not currently in trash', v_post.title;
  END IF;

  -- Role Permission Verification
  IF v_user_role = 'contributor' THEN
    RAISE EXCEPTION 'Contributors are not authorized to restore posts';
  ELSIF v_user_role = 'supervisor' THEN
    IF v_post.author_id <> v_user_id AND NOT EXISTS (
      SELECT 1 FROM public.supervisor_assignments sa
      WHERE sa.supervisor_id = v_user_id
        AND sa.contributor_id = v_post.author_id
        AND sa.is_active = true
    ) THEN
      RAISE EXCEPTION 'Supervisors can only restore team posts';
    END IF;
  ELSIF v_user_role NOT IN ('super_admin', 'communications_admin') THEN
    RAISE EXCEPTION 'Role "%" is not authorized to restore posts', v_user_role;
  END IF;

  -- Restore previously published posts as draft for editorial safety
  IF v_post.status_before_delete = 'published' THEN
    v_target_status := 'draft';
  ELSE
    v_target_status := COALESCE(v_post.status_before_delete, 'draft');
  END IF;

  -- Execute Restore
  UPDATE public.posts
  SET status = v_target_status,
      deleted_at = NULL,
      deleted_by = NULL,
      status_before_delete = NULL,
      hero_position = 'none',
      updated_at = now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

-- C. permanently_delete_post Function
CREATE OR REPLACE FUNCTION public.permanently_delete_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_is_active BOOLEAN;
  v_post public.posts;
  v_meta JSONB;
BEGIN
  -- Resolve actor exclusively through auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify active profile status and strictly require super_admin
  SELECT role, COALESCE(is_active, true) INTO v_user_role, v_is_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'User profile is inactive or unauthorized';
  END IF;

  IF v_user_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Permanent deletion is strictly restricted to Super Admins';
  END IF;

  -- Fetch target post strictly
  BEGIN
    SELECT * INTO STRICT v_post
    FROM public.posts
    WHERE id = p_post_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION 'Post with ID % not found', p_post_id;
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'Multiple posts matched ID %', p_post_id;
  END;

  -- Delete dependent relations (media_assets and Supabase Storage objects are preserved!)
  DELETE FROM public.post_categories WHERE post_id = p_post_id;
  DELETE FROM public.post_gallery_images WHERE post_id = p_post_id;
  DELETE FROM public.review_notes WHERE post_id = p_post_id;

  -- Build metadata before row removal so activity logs remain readable
  v_meta := jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'author_id', v_post.author_id,
    'previous_status', COALESCE(v_post.status_before_delete, v_post.status)
  );

  -- Perform Hard Delete
  DELETE FROM public.posts WHERE id = p_post_id;

  RETURN v_meta;
END;
$$;

-- 6. Revoke Public Execution & Grant Execution Only to Authenticated Users
REVOKE EXECUTE ON FUNCTION public.trash_post(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_post(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.permanently_delete_post(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.trash_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_post(UUID) TO authenticated;

-- 7. Update Activity Logging Trigger for Posts
CREATE OR REPLACE FUNCTION public.log_posts_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_user_id UUID;
  action_name TEXT;
  meta JSONB;
BEGIN
  acting_user_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    action_name := 'post.created';
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      COALESCE(acting_user_id, NEW.author_id),
      action_name,
      'post',
      NEW.id::text,
      jsonb_build_object('title', NEW.title, 'slug', NEW.slug, 'status', NEW.status)
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      action_name := 'post_trashed';
      meta := jsonb_build_object(
        'title', NEW.title,
        'post_id', NEW.id,
        'previous_status', OLD.status,
        'author_id', NEW.author_id,
        'timestamp', now()
      );
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      action_name := 'post_restored';
      meta := jsonb_build_object(
        'title', NEW.title,
        'post_id', NEW.id,
        'new_status', NEW.status,
        'previous_status', OLD.status_before_delete,
        'author_id', NEW.author_id,
        'timestamp', now()
      );
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'in_review' THEN
        action_name := 'post.submitted';
      ELSIF NEW.status = 'published' THEN
        action_name := 'post.published';
      ELSIF NEW.status = 'draft' AND OLD.status = 'in_review' THEN
        action_name := 'post.returned';
      ELSE
        action_name := 'post.status_changed';
      END IF;
      meta := jsonb_build_object('title', NEW.title, 'slug', NEW.slug, 'status', NEW.status, 'old_status', OLD.status);
    ELSE
      action_name := 'post.updated';
      meta := jsonb_build_object('title', NEW.title, 'slug', NEW.slug, 'status', NEW.status);
    END IF;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      COALESCE(acting_user_id, NEW.deleted_by, NEW.author_id),
      action_name,
      'post',
      NEW.id::text,
      meta
    );

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      COALESCE(acting_user_id, OLD.deleted_by, OLD.author_id),
      'post_permanently_deleted',
      'post',
      OLD.id::text,
      jsonb_build_object(
        'title', OLD.title,
        'post_id', OLD.id,
        'previous_status', COALESCE(OLD.status_before_delete, OLD.status),
        'author_id', OLD.author_id,
        'timestamp', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_posts ON public.posts;
CREATE TRIGGER trg_log_posts
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.log_posts_activity();

COMMIT;
