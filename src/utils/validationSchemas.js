import { z } from 'zod'

// Validates a datetime-local string (YYYY-MM-DDTHH:MM) or a timestamptz ISO string
const optionalDatetime = z.string().optional().nullable()

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
  redirect_url: z.string().optional().nullable(),
  // ── Event-specific columns (all nullable when type ≠ 'event') ──
  event_start_at: optionalDatetime,
  event_end_at: optionalDatetime,
  event_location: z.string().optional().nullable(),
  event_platform: z.string().optional().nullable(),
  registration_url: z.string().optional().nullable(),
  press_release_category: z.string().optional().nullable()
}).superRefine((data, ctx) => {
  const isEvent = (data.type || '').toLowerCase() === 'event'

  // Start date required for events
  if (isEvent && !data.event_start_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Event start date and time is required',
      path: ['event_start_at']
    })
  }

  // End date must not precede start date
  if (isEvent && data.event_start_at && data.event_end_at) {
    const start = new Date(data.event_start_at)
    const end = new Date(data.event_end_at)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date/time cannot be before start date/time',
        path: ['event_end_at']
      })
    }
  }

  // URL format validation for registration_url when supplied
  if (data.registration_url && data.registration_url.trim()) {
    try {
      new URL(data.registration_url.trim())
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Registration URL must be a valid URL (include https://)',
        path: ['registration_url']
      })
    }
  }

  // URL format validation for event_platform when supplied
  if (data.event_platform && data.event_platform.trim()) {
    const val = data.event_platform.trim()
    if (val.startsWith('http://') || val.startsWith('https://')) {
      try {
        new URL(val)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Platform link must be a valid URL when it starts with http/https',
          path: ['event_platform']
        })
      }
    }
  }
})

