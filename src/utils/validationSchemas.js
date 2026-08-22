import { z } from 'zod'

export const postSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  excerpt: z.string().optional().nullable(),
  content: z.string().min(1, 'Article content is required'),
  featured_image_url: z.string().optional().nullable(),
  featured_image_alt: z.string().optional().nullable(),
  type: z.string().default('news'),
  region: z.string().optional().nullable(),
  theme: z.string().optional().nullable(),
  hero_position: z.enum(['none', 'primary', 'secondary']).default('none'),
  featured_until: z.string().optional().nullable(),
  seo_title: z.string().optional().nullable(),
  seo_description: z.string().optional().nullable(),
  reference_number: z.string().optional().nullable(),
  external_url: z.string().optional().nullable(),
  redirect_url: z.string().optional().nullable()
})
