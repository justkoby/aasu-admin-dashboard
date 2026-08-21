/**
 * Generates a URL-safe lowercase slug from a given string.
 * @param {string} text - The input text (e.g. title) to slugify
 * @returns {string} - The lowercase URL-safe slug
 */
export function createSlug(text) {
  if (!text) return ''
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars except dashes
    .replace(/\-\-+/g, '-')         // Replace multiple dashes with single dash
    .replace(/^-+/, '')             // Trim dashes from start
    .replace(/-+$/, '')             // Trim dashes from end
}
