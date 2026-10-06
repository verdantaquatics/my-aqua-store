import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import { getPublicSettings } from '@/utils/settings'
import { notFound } from 'next/navigation'
import CollectionPageClient from '@/components/CollectionPageClient'

// Cached and served from the CDN; refreshed every 5 minutes and on changes
export const revalidate = 300

export default async function FeaturedCollectionPage() {
  const settings = await getPublicSettings()
  if (!settings.show_featured) {
    notFound()
  }

  const supabase = createAdminClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq('is_featured', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
  ])

  return (
    <CollectionPageClient
      title="Featured Products"
      titleBn="ফিচার্ড পণ্য"
      subtitle="Carefully curated and hand-picked showcase items recommended by our store."
      subtitleBn="আমাদের স্টোরের বাছাই করা ও সুপারিশকৃত বিশেষ পণ্যসমূহ।"
      badgeText="Curated Showcase"
      badgeTextBn="বাছাইকৃত সংগ্রহ"
      badgeColorClass="bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
      products={toListingProducts(products)}
      categories={categories || []}
    />
  )
}
