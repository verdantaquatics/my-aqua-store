import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import CollectionPageClient from '@/components/CollectionPageClient'
import type { Metadata } from 'next'
import { getPublicSettings } from '@/utils/settings'

// Full catalog ("View all products" from the home page). Cached on the CDN;
// refreshed every 5 minutes and whenever products or stock change.
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings()
  return {
    title: `All Products - ${settings.store_name}`,
    description: `Browse every product available at ${settings.store_name}.`
  }
}

export default async function AllProductsPage() {
  const supabase = createAdminClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
  ])

  return (
    <CollectionPageClient
      title="All Products"
      subtitle="Browse our complete range of aquariums, plants, livestock and accessories."
      badgeText="Full Catalog"
      badgeColorClass="bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/30"
      products={toListingProducts(products)}
      categories={categories || []}
    />
  )
}
