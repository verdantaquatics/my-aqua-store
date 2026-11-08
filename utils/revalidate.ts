import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'
import type { StockChange } from '@/utils/inventory'

/**
 * Storefront pages (home, collections, categories, products, about, contact) are
 * cached and served from the CDN, and refreshed on demand when something changes.
 *
 * Every refresh is billed as an ISR write for each page that gets rebuilt, so keep
 * refreshes as narrow as possible:
 * - revalidateStorefront(): whole site. Only for changes that affect every page
 *   (settings, categories, promotions, product create/edit/delete).
 * - revalidateStockChanges(): stock moved because of an order. Refreshes only the
 *   affected product pages, plus the listing pages when a product went in or out of stock.
 */
export function revalidateStorefront() {
  try {
    revalidatePath('/', 'layout')
  } catch (err) {
    console.error('Failed to revalidate storefront cache:', err)
  }
}

// Pages that show product cards (and their "out of stock" badges)
const LISTING_PATHS = ['/', '/products', '/featured', '/trending', '/best-seller']

export async function revalidateStockChanges(
  db: SupabaseClient,
  changes: Array<StockChange | null | undefined>
) {
  try {
    const real = changes.filter((c): c is StockChange => !!c && c.before !== c.after)
    if (real.length === 0) return

    const productIds = Array.from(new Set(real.map((c) => c.productId)))
    const { data: products } = await db.from('products').select('slug').in('id', productIds)
    for (const p of products || []) {
      if (p?.slug) revalidatePath(`/product/${p.slug}`)
    }

    // Listing pages only show in-stock / out-of-stock, so skip them unless that flipped
    const availabilityFlipped = real.some((c) => (c.before > 0) !== (c.after > 0))
    if (availabilityFlipped) {
      LISTING_PATHS.forEach((path) => revalidatePath(path))
      revalidatePath('/category/[slug]', 'page')
    }
  } catch (err) {
    console.error('Failed to revalidate product pages after stock change:', err)
  }
}
