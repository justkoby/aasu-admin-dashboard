-- Migration 005_public_read_published_content.sql
-- Description: Allow anonymous and public users to read published posts, active categories, and post_categories links.

-- 1. Public Read Policy for Published Posts
DROP POLICY IF EXISTS "public_select_published_posts" ON public.posts;
CREATE POLICY "public_select_published_posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND published_at <= now()
);

-- 2. Public Read Policy for Active Categories
DROP POLICY IF EXISTS "public_select_active_categories" ON public.categories;
CREATE POLICY "public_select_active_categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(is_active, true) = true
);

-- 3. Public Read Policy for Post-Category Relationships
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
  )
);

