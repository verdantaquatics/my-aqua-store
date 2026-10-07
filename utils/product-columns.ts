// Columns safe to send to the storefront. Never use select('*') for public pages:
// it would ship internal fields such as buying_price (wholesale cost) to the browser.
export const PUBLIC_PRODUCT_COLUMNS =
  'id, category_id, name, slug, short_description, description, price, old_price, stock, images, variations, is_featured, is_best_seller, is_trending, is_hidden, created_at'

const LISTING_DESCRIPTION_LENGTH = 240

/** Strip tags and decode common HTML entities (e.g. "&amp;" -> "&") */
export function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Listing pages (home, collections, categories) only need a short plain-text
 * description for search and slider captions. Sending every product's full rich
 * HTML description made those pages several hundred KB.
 */
export function toListingProducts<T extends { description?: string | null }>(products: T[] | null | undefined): T[] {
  return (products || []).map((p) => {
    const text = htmlToPlainText(p.description || '')
    return {
      ...p,
      description: text.length > LISTING_DESCRIPTION_LENGTH ? `${text.slice(0, LISTING_DESCRIPTION_LENGTH)}…` : text
    }
  })
}
