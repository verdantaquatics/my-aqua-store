export interface VariationValue {
  label: string
  stock: number
  image_url: string
  price?: number
}

export interface VariationOption {
  name: string
  values: VariationValue[]
}

// Convert legacy flat variation format or rich format to standard VariationOption[]
export function parseProductVariations(variations: any, fallbackStock = 0): VariationOption[] {
  if (!variations || typeof variations !== 'object') return []

  // Check if already in rich format
  if (Array.isArray(variations.options)) {
    return variations.options.map((opt: any) => ({
      name: opt.name || 'Option',
      values: Array.isArray(opt.values)
        ? opt.values.map((v: any) => ({
            label: v.label || String(v),
            stock: typeof v.stock === 'number' ? v.stock : fallbackStock,
            image_url: v.image_url || '',
            price: v.price !== undefined && v.price !== null && v.price !== '' ? Number(v.price) : undefined
          }))
        : []
    }))
  }

  // Legacy flat format e.g. {"sizes": ["1.5 Feet", "2 Feet"]}
  const options: VariationOption[] = []
  Object.entries(variations).forEach(([key, values]) => {
    if (key === 'category_ids') return
    if (Array.isArray(values) && values.length > 0) {
      const cleanName = key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, '')
      const stockPerVal = Math.max(1, Math.floor(fallbackStock / values.length))
      options.push({
        name: cleanName,
        values: values.map((v: any) => ({
          label: String(v),
          stock: stockPerVal,
          image_url: '',
          price: undefined
        }))
      })
    }
  })

  return options
}

/** Price and photo for the chosen variant (same rules the product page and server checkout use) */
export function resolveVariantSelection(
  product: { price: number | string; images?: string[]; variations?: any; stock?: number },
  selected: Record<string, string>
): { price: number; image?: string } {
  let price = Number(product.price)
  let image: string | undefined
  for (const opt of parseProductVariations(product.variations, product.stock)) {
    const value = opt.values.find((v) => v.label === selected[opt.name])
    if (!value) continue
    if (value.price !== undefined && Number(value.price) > 0) price = Number(value.price)
    if (value.image_url) image = value.image_url
  }
  return { price, image }
}
