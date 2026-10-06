import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import { getPublicSettings } from '@/utils/settings'
import { notFound } from 'next/navigation'
import CollectionPageClient from '@/components/CollectionPageClient'

// Cached and served from the CDN; refreshed every 5 minutes and on changes
export const revalidate = 300

export default async function TrendingCollectionPage() {
  const settings = await getPublicSettings()
  if (!settings.show_trending) {
    notFound()
  }

  const supabase = createAdminClient()
  const autoTrending = settings.auto_trending !== false
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: categories }, { data: allProducts }, { data: recentItems }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase.from('products').select(PUBLIC_PRODUCT_COLUMNS).eq('is_hidden', false),
    // 30-day sales calculation
    autoTrending
      ? supabase
          .from('order_items')
          .select('product_id, quantity, orders!inner(created_at, order_status)')
          .gte('orders.created_at', thirtyDaysAgo)
          .neq('orders.order_status', 'Cancelled')
      : Promise.resolve({ data: [] as any[] })
  ])

  let trendingProducts = allProducts || []

  if (autoTrending) {
    const salesMap: Record<string, number> = {}
    ;(recentItems || []).forEach((item: any) => {
      const pid = item.product_id
      if (pid) {
        salesMap[pid] = (salesMap[pid] || 0) + Number(item.quantity || 1)
      }
    })

    trendingProducts = [...trendingProducts]
      .filter((p) => (salesMap[p.id] || 0) > 0 || Boolean(p.is_trending))
      .sort((a, b) => (salesMap[b.id] || 0) - (salesMap[a.id] || 0))
  } else {
    trendingProducts = trendingProducts.filter((p) => p.is_trending)
  }

  return (
    <CollectionPageClient
      title="Trending Products"
      subtitle="The hottest products generating the most interest and sales over the past 30 days."
      badgeText="Hot Right Now"
      badgeColorClass="bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30"
      products={toListingProducts(trendingProducts)}
      categories={categories || []}
    />
  )
}
