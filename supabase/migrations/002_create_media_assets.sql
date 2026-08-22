-- Migration 002_create_media_assets.sql
-- Description: Create media_assets table with indexes and role-based RLS policies.

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT UNIQUE NOT NULL,
  public_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  width INTEGER NULLABLE,
  height INTEGER NULLABLE,
  alt_text TEXT NULLABLE,
  caption TEXT NULLABLE,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performant lookups and filtering
CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by ON public.media_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_assets_storage_path ON public.media_assets(storage_path);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Helper function to resolve authenticated profile role
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policy 1: SELECT
-- Super Admin / Comms Admin: can view all
-- Supervisor: can view own uploads OR uploads by assigned contributors
-- Contributor: can view own uploads
CREATE POLICY "media_assets_select_policy" ON public.media_assets
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    public.get_auth_user_role() IN ('super_admin', 'communications_admin')
    OR uploaded_by = auth.uid()
    OR (
      public.get_auth_user_role() = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.supervisor_id = auth.uid()
          AND sa.contributor_id = media_assets.uploaded_by
          AND sa.is_active = true
      )
    )
  )
);

-- RLS Policy 2: INSERT
CREATE POLICY "media_assets_insert_policy" ON public.media_assets
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND uploaded_by = auth.uid()
);

-- RLS Policy 3: UPDATE
CREATE POLICY "media_assets_update_policy" ON public.media_assets
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND (
    public.get_auth_user_role() IN ('super_admin', 'communications_admin')
    OR uploaded_by = auth.uid()
  )
);

-- RLS Policy 4: DELETE
CREATE POLICY "media_assets_delete_policy" ON public.media_assets
FOR DELETE
USING (
  auth.role() = 'authenticated' AND (
    public.get_auth_user_role() IN ('super_admin', 'communications_admin')
    OR uploaded_by = auth.uid()
  )
);
