-- Migration 003_activity_log_triggers.sql
-- Description: Ensure activity_logs schema, RLS policies, and database triggers for automated activity logging.

-- 1. Table schema verification & default setup
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULLABLE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON public.activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to resolve profile role
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policy: SELECT on activity_logs
-- Super Admin: all logs
-- Comms Admin: content logs ('post', 'category', 'media', 'review_note')
-- Supervisor: own logs + assigned contributors' logs
-- Contributor: no access to global activity log
DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;

CREATE POLICY "activity_logs_select_policy" ON public.activity_logs
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    public.get_auth_user_role() = 'super_admin'
    OR (
      public.get_auth_user_role() = 'communications_admin' AND
      entity_type IN ('post', 'category', 'media', 'review_note')
    )
    OR user_id = auth.uid()
    OR (
      public.get_auth_user_role() = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.supervisor_id = auth.uid()
          AND sa.contributor_id = activity_logs.user_id
          AND sa.is_active = true
      )
    )
  )
);

-- RLS Policy: INSERT on activity_logs
DROP POLICY IF EXISTS "activity_logs_insert_policy" ON public.activity_logs;

CREATE POLICY "activity_logs_insert_policy" ON public.activity_logs
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
);

-- ── 2. DATABASE TRIGGERS FOR AUTOMATED LOGGING ────────────────────────────────

-- Trigger function for POSTS
CREATE OR REPLACE FUNCTION public.log_posts_activity()
RETURNS TRIGGER AS $$
DECLARE
  acting_user_id UUID;
  action_name TEXT;
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
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'in_review' THEN
        action_name := 'post.submitted';
      ELSIF NEW.status = 'published' THEN
        action_name := 'post.published';
      ELSIF NEW.status = 'draft' AND OLD.status = 'in_review' THEN
        action_name := 'post.returned';
      ELSE
        action_name := 'post.status_changed';
      END IF;
    ELSE
      action_name := 'post.updated';
    END IF;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      COALESCE(acting_user_id, NEW.author_id),
      action_name,
      'post',
      NEW.id::text,
      jsonb_build_object('title', NEW.title, 'slug', NEW.slug, 'status', NEW.status, 'old_status', OLD.status)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      COALESCE(acting_user_id, OLD.author_id),
      'post.deleted',
      'post',
      OLD.id::text,
      jsonb_build_object('title', OLD.title)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_posts ON public.posts;
CREATE TRIGGER trg_log_posts
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.log_posts_activity();

-- Trigger function for CATEGORIES
CREATE OR REPLACE FUNCTION public.log_categories_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'category.created', 'category', NEW.id::text, jsonb_build_object('name', NEW.name, 'slug', NEW.slug));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'category.updated', 'category', NEW.id::text, jsonb_build_object('name', NEW.name, 'slug', NEW.slug));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'category.deleted', 'category', OLD.id::text, jsonb_build_object('name', OLD.name));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_categories ON public.categories;
CREATE TRIGGER trg_log_categories
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.log_categories_activity();

-- Trigger function for MEDIA_ASSETS
CREATE OR REPLACE FUNCTION public.log_media_assets_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.uploaded_by), 'media.uploaded', 'media', NEW.id::text, jsonb_build_object('filename', NEW.original_filename));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.uploaded_by), 'media.updated', 'media', NEW.id::text, jsonb_build_object('filename', NEW.original_filename, 'alt_text', NEW.alt_text));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), OLD.uploaded_by), 'media.deleted', 'media', OLD.id::text, jsonb_build_object('filename', OLD.original_filename));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_media_assets ON public.media_assets;
CREATE TRIGGER trg_log_media_assets
AFTER INSERT OR UPDATE OR DELETE ON public.media_assets
FOR EACH ROW EXECUTE FUNCTION public.log_media_assets_activity();

-- Trigger function for PROFILES (Role & Status Changes)
CREATE OR REPLACE FUNCTION public.log_profiles_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
      VALUES (auth.uid(), 'user.role_changed', 'user', NEW.id::text, jsonb_build_object('target_user_name', NEW.full_name, 'target_user_email', NEW.email, 'old_role', OLD.role, 'new_role', NEW.role));
    END IF;

    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
      VALUES (auth.uid(), 'user.status_changed', 'user', NEW.id::text, jsonb_build_object('target_user_name', NEW.full_name, 'target_user_email', NEW.email, 'is_active', NEW.is_active));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_profiles ON public.profiles;
CREATE TRIGGER trg_log_profiles
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_profiles_activity();

-- Trigger function for SUPERVISOR_ASSIGNMENTS
CREATE OR REPLACE FUNCTION public.log_supervisor_assignments_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.assigned_by), 'assignment.created', 'assignment', NEW.id::text, jsonb_build_object('supervisor_id', NEW.supervisor_id, 'contributor_id', NEW.contributor_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.assigned_by), 'assignment.removed', 'assignment', NEW.id::text, jsonb_build_object('supervisor_id', NEW.supervisor_id, 'contributor_id', NEW.contributor_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_supervisor_assignments ON public.supervisor_assignments;
CREATE TRIGGER trg_log_supervisor_assignments
AFTER INSERT OR UPDATE ON public.supervisor_assignments
FOR EACH ROW EXECUTE FUNCTION public.log_supervisor_assignments_activity();
