/**
 * Sanitizes rich-text HTML so it can be rendered safely in the review preview.
 * - Removes script/style/embedded-content elements entirely.
 * - Strips event-handler attributes (onclick, onerror, ...).
 * - Removes javascript:/vbscript: URLs and non-image data: URLs.
 * - Removes inline styles and srcset to avoid exfiltration vectors.
 *
 * @param {string} html - The raw HTML produced by the TipTap editor
 * @returns {string} - Sanitized HTML safe for dangerouslySetInnerHTML
 */
export function sanitizeHtml(html) {
  if (!html) return ''

  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1. Remove elements that can execute code or load external resources
  const dangerousTags = [
    'script', 'style', 'iframe', 'frame', 'object', 'embed',
    'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select'
  ]
  doc.querySelectorAll(dangerousTags.join(',')).forEach((el) => el.remove())

  // 2. Scrub attributes on every remaining element
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()

      // Event handlers
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }

      // Inline styles are not needed for preview and can hide tricks
      if (name === 'style' || name === 'srcset') {
        el.removeAttribute(attr.name)
        continue
      }

      // Unsafe URL schemes on navigation/resource attributes
      if (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') {
        const value = attr.value || ''
        const isUnsafe = /^\s*(javascript|vbscript)\s*:/i.test(value) ||
          /^\s*data:(?!image\/(png|jpe?g|gif|webp|svg\+xml))/i.test(value)
        if (isUnsafe) {
          el.removeAttribute(attr.name)
        }
      }
    }

    // Force links to open safely in a new tab
    if (el.tagName === 'A') {
      el.setAttribute('rel', 'noopener noreferrer')
      el.setAttribute('target', '_blank')
    }
  })

  return doc.body.innerHTML
}
