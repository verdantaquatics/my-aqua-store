import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import { getPublicSettings } from '@/utils/settings'
import { notFound } from 'next/navigation'
import CollectionPageClient from '@/components/CollectionPageClient'

// Cached and served from the CDN; refreshed every 5 minutes and on changes
export const revalidate = 300

export default async function BestSellerCollectionPage() {
  const settings = await getPublicSettings()
  if (!settings.show_best_seller) {
    notFound()
  }

  const supabase = createAdminClient()
  const autoBestSeller = settings.auto_best_seller !== false

  const [{ data: categories }, { data: allProducts }, { data: allTimeItems }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase.from('products').select(PUBLIC_PRODUCT_COLUMNS).eq('is_hidden', false),
    // All-time sales calculation from non-cancelled orders
    autoBestSeller
      ? supabase
          .from('order_items')
          .select('product_id, quantity, orders!inner(created_at, order_status)')
          .neq('orders.order_status', 'Cancelled')
      : Promise.resolve({ data: [] as any[] })
  ])

  let bestSellerProducts = allProducts || []

  if (autoBestSeller) {
    const salesMap: Record<string, number> = {}
    ;(allTimeItems || []).forEach((item: any) => {
      const pid = item.product_id
      if (pid) {
        salesMap[pid] = (salesMap[pid] || 0) + Number(item.quantity || 1)
      }
    })

    bestSellerProducts = [...bestSellerProducts]
      .filter((p) => (salesMap[p.id] || 0) > 0 || Boolean(p.is_best_seller))
      .sort((a, b) => (salesMap[b.id] || 0) - (salesMap[a.id] || 0))
  } else {
    bestSellerProducts = bestSellerProducts.filter((p) => p.is_best_seller)
  }

  return (
    <CollectionPageClient
      title="All-Time Best Sellers"
      titleBn="সর্বোচ্চ বিক্রিত পণ্য"
      subtitle="Our most loved, highest-rated, and frequently ordered aquascaping essentials."
      subtitleBn="ক্রেতাদের সবচেয়ে প্রিয় ও সবচেয়ে বেশি অর্ডার করা অ্যাকোয়াস্কেপিং পণ্যসমূহ।"
      badgeText="Customer Favorites"
      badgeTextBn="ক্রেতাদের পছন্দ"
      badgeColorClass="bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30"
      products={toListingProducts(bestSellerProducts)}
      categories={categories || []}
    />
  )
}
