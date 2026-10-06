import { revalidatePath } from 'next/cache'

/**
 * Storefront pages (home, collections, categories, products, about, contact) are
 * cached and served instantly from the CDN. Call this after anything that changes
 * what customers see - products, categories, settings, promotions, or stock
 * (orders) - so the next visit gets fresh pages.
 */
export function revalidateStorefront() {
  try {
    revalidatePath('/', 'layout')
  } catch (err) {
    console.error('Failed to revalidate storefront cache:', err)
  }
}
