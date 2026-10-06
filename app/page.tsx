import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import HomePageClient from '@/components/HomePageClient'

// Cached and served from the CDN; refreshed every 5 minutes and immediately
// whenever products, settings or stock change (see utils/revalidate.ts)
export const revalidate = 300

export default async function HomePage() {
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: categories }, { data: products }, { data: allTimeItems }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false }),
    // Non-cancelled order items for Best Seller & Trending calculations
    supabase
      .from('order_items')
      .select('product_id, quantity, orders!inner(created_at, order_status)')
      .neq('orders.order_status', 'Cancelled')
  ])

  const allTimeSales: Record<string, number> = {}
  const last30DaysSales: Record<string, number> = {}

  if (allTimeItems) {
    allTimeItems.forEach((item: any) => {
      const pid = item.product_id
      const qty = Number(item.quantity || 1)
      if (pid) {
        allTimeSales[pid] = (allTimeSales[pid] || 0) + qty
        if (item.orders?.created_at && new Date(item.orders.created_at) >= new Date(thirtyDaysAgo)) {
          last30DaysSales[pid] = (last30DaysSales[pid] || 0) + qty
        }
      }
    })
  }

  return (
    <HomePageClient
      products={toListingProducts(products)}
      categories={categories || []}
      allTimeSales={allTimeSales}
      last30DaysSales={last30DaysSales}
    />
  )
}
