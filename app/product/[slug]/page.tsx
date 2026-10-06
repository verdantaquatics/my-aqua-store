import { createAdminClient } from '@/utils/supabase/server'
import { PUBLIC_PRODUCT_COLUMNS, toListingProducts } from '@/utils/product-columns'
import { sanitizeRichText } from '@/utils/sanitize'
import { notFound } from 'next/navigation'
import ProductDetailClient from '@/components/ProductDetailClient'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Each product page is generated on its first visit, then served from the CDN.
// Refreshed every 5 minutes and immediately when products or stock change.
export const revalidate = 300

export async function generateStaticParams() {
  return []
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data: product } = await supabase
    .from('products')
    .select(`${PUBLIC_PRODUCT_COLUMNS}, categories(name, slug)`)
    .eq('slug', slug)
    .maybeSingle()

  if (!product || product.is_hidden) {
    notFound()
  }

  product.description = sanitizeRichText(product.description)

  // Categories and related products in parallel
  const [{ data: categories }, { data: sameCategoryProducts }, { data: otherProducts }] = await Promise.all([
    supabase.from('categories').select('id, name, slug').order('name'),
    product.category_id
      ? supabase
          .from('products')
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq('category_id', product.category_id)
          .neq('id', product.id)
          .eq('is_hidden', false)
          .limit(4)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .neq('id', product.id)
      .eq('is_hidden', false)
      .limit(8)
  ])

  // Same-category products first, topped up with others to 4
  const relatedProducts: any[] = []
  const seen = new Set<string>()
  for (const p of [...(sameCategoryProducts || []), ...(otherProducts || [])]) {
    if (relatedProducts.length >= 4) break
    if (!seen.has(p.id)) {
      seen.add(p.id)
      relatedProducts.push(p)
    }
  }

  return (
    <ProductDetailClient
      product={product as any}
      categories={categories || []}
      relatedProducts={toListingProducts(relatedProducts)}
    />
  )
}
