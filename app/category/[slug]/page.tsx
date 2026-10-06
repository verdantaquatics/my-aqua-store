import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import { getDescendantIds } from '@/utils/categories'
import { notFound } from 'next/navigation'
import CategoryPageClient from '@/components/CategoryPageClient'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Generated on first visit, then served from the CDN (refreshed on changes)
export const revalidate = 300

export async function generateStaticParams() {
  return []
}

// Products flagged "featured" also belong to the built-in Featured Products category
const FEATURED_CATEGORY_ID = 'c0000000-0000-0000-0000-000000000008'

function productCategoryIds(product: any): string[] {
  const ids: string[] = Array.isArray(product.variations?.category_ids)
    ? [...product.variations.category_ids]
    : product.category_id ? [product.category_id] : []
  if (product.is_featured && !ids.includes(FEATURED_CATEGORY_ID)) ids.push(FEATURED_CATEGORY_ID)
  return ids
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = createAdminClient()

  const [{ data: allCategories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase
      .from('products')
      .select(`${PUBLIC_PRODUCT_COLUMNS}, categories(name, slug)`)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
  ])

  const categories = allCategories || []
  const category = categories.find((c: any) => c.slug === slug)
  if (!category) {
    notFound()
  }

  // Only ship products in this category or any category below it
  const treeIds = new Set([category.id, ...getDescendantIds(category.id, categories)])
  const inCategory = (products || []).filter((p) => productCategoryIds(p).some((id) => treeIds.has(id)))

  return (
    <CategoryPageClient
      category={category}
      allCategories={categories}
      initialProducts={toListingProducts(inCategory) as any}
    />
  )
}
