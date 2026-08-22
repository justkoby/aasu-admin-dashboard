-- Migration 006_post_gallery_and_extended_fields.sql
-- Description: Add reference_number, external_url, redirect_url to posts, create post_gallery_images table, and set up RLS policies.

-- 1. Add new columns to public.posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reference_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS external_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS redirect_url TEXT NULL;

-- 2. Create post_gallery_images table
CREATE TABLE IF NOT EXISTS public.post_gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  media_asset_id UUID NULL REFERENCES public.media_assets(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT NULL,
  alt_text TEXT NULL,
  caption TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_sort_order_non_negative CHECK (sort_order >= 0),
  CONSTRAINT uq_post_gallery_post_image UNIQUE (post_id, image_url)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_gallery_images_post_id ON public.post_gallery_images(post_id);
CREATE INDEX IF NOT EXISTS idx_post_gallery_images_sort_order ON public.post_gallery_images(post_id, sort_order);

-- Enable RLS
ALTER TABLE public.post_gallery_images ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR POST_GALLERY_IMAGES

-- A. Anonymous & Public SELECT Policy
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
  )
);

-- B. Super Admin & Comms Admin Full Access Policy
DROP POLICY IF EXISTS "content_admin_manage_gallery_images" ON public.post_gallery_images;
CREATE POLICY "content_admin_manage_gallery_images"
ON public.post_gallery_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles prof
    WHERE prof.id = auth.uid()
      AND prof.role IN ('super_admin', 'communications_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles prof
    WHERE prof.id = auth.uid()
      AND prof.role IN ('super_admin', 'communications_admin')
  )
);

-- C. Contributor Manage Own Editable Post Gallery Policy
DROP POLICY IF EXISTS "contributor_manage_own_gallery_images" ON public.post_gallery_images;
CREATE POLICY "contributor_manage_own_gallery_images"
ON public.post_gallery_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_gallery_images.post_id
      AND p.author_id = auth.uid()
      AND p.status IN ('draft', 'revision_requested', 'rejected')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_gallery_images.post_id
      AND p.author_id = auth.uid()
      AND p.status IN ('draft', 'revision_requested', 'rejected')
  )
);

-- D. Supervisor Manage Own or Assigned Contributor Post Gallery Policy
DROP POLICY IF EXISTS "supervisor_manage_assigned_gallery_images" ON public.post_gallery_images;
CREATE POLICY "supervisor_manage_assigned_gallery_images"
ON public.post_gallery_images
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    JOIN public.profiles prof ON prof.id = auth.uid()
    WHERE p.id = post_gallery_images.post_id
      AND prof.role = 'supervisor'
      AND (
        p.author_id = auth.uid()
        OR p.assigned_supervisor_id = auth.uid()
        OR p.author_id IN (SELECT id FROM public.profiles WHERE supervisor_id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.posts p
    JOIN public.profiles prof ON prof.id = auth.uid()
    WHERE p.id = post_gallery_images.post_id
      AND prof.role = 'supervisor'
      AND (
        p.author_id = auth.uid()
        OR p.assigned_supervisor_id = auth.uid()
        OR p.author_id IN (SELECT id FROM public.profiles WHERE supervisor_id = auth.uid())
      )
  )
);

