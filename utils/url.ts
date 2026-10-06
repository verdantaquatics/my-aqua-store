/**
 * Formats an external URL so that relative-looking URLs (like "instagram.com/xyz")
 * are automatically prepended with "https://" to avoid navigating to localhost:3000/instagram.com.
 */
export function formatExternalUrl(url?: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

/**
 * Validates a link an admin configures for a storefront button.
 * Allows site paths ("/products", "/category/plants"), on-page anchors ("#catalog")
 * and full http(s) URLs. Anything else (e.g. "javascript:") returns ''.
 */
export function safeSiteLink(link?: string | null): string {
  const value = String(link || '').trim()
  if (!value) return ''
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (value.startsWith('#')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}
