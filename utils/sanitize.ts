import sanitizeHtml from 'sanitize-html'

// Formatting produced by the product description editor (TipTap StarterKit + Link + Underline)
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'hr', 'span'
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' })
  }
}

/** Strip scripts, event handlers and unsafe URLs from rich-text HTML */
export function sanitizeRichText(html: unknown): string {
  if (typeof html !== 'string' || !html) return ''
  return sanitizeHtml(html, RICH_TEXT_OPTIONS)
}
