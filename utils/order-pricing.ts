import { SupabaseClient } from '@supabase/supabase-js'
import { StoreSettings } from '@/utils/settings'
import { orValue, ilikeExact, phoneVariants } from '@/utils/postgrest'
import { getDeliveryCharge } from '@/utils/delivery'

// Server-side source of truth for order amounts. Prices, delivery charges and
// discounts sent by the browser are never trusted.

const MAX_CART_LINES = 50
const MAX_LINE_QTY = 999

export interface PricedItem {
  id: string
  name: string
  quantity: number
  price: number
  selectedVariations: Record<string, string>
  categoryIds: string[]
}

export class PricingError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function getVariationOptions(variations: any): { name: string; values: { label: string; stock?: number; price?: number }[] }[] {
  if (!variations || typeof variations !== 'object' || !Array.isArray(variations.options)) return []
  return variations.options
    .filter((opt: any) => opt && Array.isArray(opt.values))
    .map((opt: any) => ({
      name: String(opt.name || 'Option'),
      values: opt.values.map((v: any) => ({
        label: String(v?.label ?? v),
        stock: typeof v?.stock === 'number' ? v.stock : undefined,
        price: v?.price !== undefined && v?.price !== null && v?.price !== '' ? Number(v.price) : undefined
      }))
    }))
}

function getProductCategoryIds(product: any): string[] {
  const ids = new Set<string>()
  if (product.category_id) ids.add(product.category_id)
  if (Array.isArray(product.variations?.category_ids)) {
    product.variations.category_ids.forEach((id: any) => id && ids.add(String(id)))
  }
  return Array.from(ids)
}

/** Re-price the cart from the products table and check stock */
export async function priceCart(db: SupabaseClient, cartItems: any): Promise<{ items: PricedItem[]; subtotal: number }> {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new PricingError('Your shopping cart is empty.')
  }
  if (cartItems.length > MAX_CART_LINES) {
    throw new PricingError('Too many items in cart.')
  }

  const ids = Array.from(new Set(cartItems.map((it: any) => String(it?.id || '')).filter(Boolean)))
  const { data: products, error } = await db
    .from('products')
    .select('id, name, price, stock, variations, category_id, is_hidden')
    .in('id', ids)

  if (error) throw new PricingError('Could not load products for this order.', 500)
  const byId = new Map((products || []).map((p: any) => [p.id, p]))

  // Track requested quantity per product+variant so duplicate lines can't bypass stock checks
  const requested = new Map<string, number>()
  const items: PricedItem[] = []

  for (const raw of cartItems) {
    const product: any = byId.get(String(raw?.id || ''))
    if (!product || product.is_hidden) {
      throw new PricingError('One of the products in your cart is no longer available. Please review your cart.')
    }

    const quantity = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_LINE_QTY) {
      throw new PricingError(`Invalid quantity for ${product.name}.`)
    }

    const options = getVariationOptions(product.variations)
    const selectedRaw = raw.selectedVariations && typeof raw.selectedVariations === 'object' ? raw.selectedVariations : {}
    const selectedVariations: Record<string, string> = {}

    let price = Number(product.price)
    let available = Number(product.stock) || 0

    if (options.length > 0) {
      let minStock = Infinity
      for (const opt of options) {
        const label = selectedRaw[opt.name]
        const value = opt.values.find((v) => v.label === label)
        if (!value) {
          throw new PricingError(`Please choose a valid ${opt.name} for ${product.name}.`)
        }
        selectedVariations[opt.name] = value.label
        if (value.price !== undefined && value.price > 0) price = value.price
        if (typeof value.stock === 'number') minStock = Math.min(minStock, value.stock)
      }
      if (minStock !== Infinity) available = minStock
    }

    const stockKey = `${product.id}:${JSON.stringify(selectedVariations)}`
    const totalRequested = (requested.get(stockKey) || 0) + quantity
    requested.set(stockKey, totalRequested)
    if (totalRequested > available) {
      throw new PricingError(
        available > 0
          ? `Only ${available} unit(s) of ${product.name} left in stock.`
          : `${product.name} is out of stock.`
      )
    }

    items.push({
      id: product.id,
      name: product.name,
      quantity,
      price,
      selectedVariations,
      categoryIds: getProductCategoryIds(product)
    })
  }

  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0)
  return { items, subtotal }
}

/** Whether the delivery address is inside the store's home city (zone 1 rate) */
export function isInsideStoreCity(settings: StoreSettings, opts: { pathaoActive: boolean; cityName?: string; cityId?: number; region?: string }): boolean {
  if (!opts.pathaoActive) {
    return opts.region !== 'outside_dhaka'
  }
  const base = (settings.store_city_name || '').toLowerCase().trim()
  const city = (opts.cityName || '').toLowerCase().trim()
  if (city && base) return city.includes(base) || base.includes(city)
  return Number(opts.cityId) === Number(settings.store_city_id || 1)
}

export function computeDeliveryCharge(settings: StoreSettings, insideCity: boolean): number {
  return getDeliveryCharge(settings, insideCity)
}

export interface PromoResult {
  promo: any
  discountAmount: number
}

/** Validate a promo code against server-priced items. Throws PricingError when not applicable. */
export async function evaluatePromo(
  db: SupabaseClient,
  args: {
    code: string
    items: PricedItem[]
    deliveryCharge: number
    customerPhone?: string
    customerEmail?: string
    userId?: string | null
  }
): Promise<PromoResult> {
  const cleanCode = String(args.code || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!cleanCode) throw new PricingError('Please enter a promo code.')

  const { data: promo } = await db.from('promo_codes').select('*').eq('code', cleanCode).maybeSingle()

  if (!promo) throw new PricingError('Invalid promo code. Please check and try again.', 404)
  if (!promo.is_active) throw new PricingError('This promo code is no longer active.')

  const now = new Date()
  if (promo.start_date && new Date(promo.start_date) > now) {
    throw new PricingError('This promo code campaign has not started yet.')
  }
  if (promo.end_date && new Date(promo.end_date) < now) {
    throw new PricingError('This promo code has expired.')
  }
  if (promo.usage_limit > 0 && promo.usage_count >= promo.usage_limit) {
    throw new PricingError('This promo code has reached its maximum global usage limit.')
  }

  // Per-customer redemption limit
  if (promo.per_user_limit > 0) {
    const customerFilters: string[] = []
    if (args.userId) customerFilters.push(`user_id.eq.${orValue(args.userId)}`)
    const email = (args.customerEmail || '').trim().toLowerCase()
    if (email) customerFilters.push(`customer_email.ilike.${ilikeExact(email)}`)
    phoneVariants(args.customerPhone || '').forEach((p) => customerFilters.push(`customer_phone.eq.${orValue(p)}`))

    if (customerFilters.length > 0) {
      const { count } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .or(`promo_code_id.eq.${orValue(promo.id)},promo_code.eq.${orValue(cleanCode)}`)
        .neq('order_status', 'Cancelled')
        .or(customerFilters.join(','))

      if (count !== null && count >= promo.per_user_limit) {
        throw new PricingError(
          `You have already redeemed this promo code the maximum allowed limit (${promo.per_user_limit} time${promo.per_user_limit > 1 ? 's' : ''}).`
        )
      }
    }
  }

  const includedProdIds: string[] = Array.isArray(promo.included_product_ids) ? promo.included_product_ids : []
  const excludedProdIds: string[] = Array.isArray(promo.excluded_product_ids) ? promo.excluded_product_ids : []
  const includedCatIds: string[] = Array.isArray(promo.included_category_ids) ? promo.included_category_ids : []
  const excludedCatIds: string[] = Array.isArray(promo.excluded_category_ids) ? promo.excluded_category_ids : []

  let eligible = args.items
  if (includedProdIds.length > 0) eligible = eligible.filter((it) => includedProdIds.includes(it.id))
  if (includedCatIds.length > 0) eligible = eligible.filter((it) => it.categoryIds.some((c) => includedCatIds.includes(c)))

  if ((includedProdIds.length > 0 || includedCatIds.length > 0) && eligible.length === 0) {
    throw new PricingError('This promo code is not applicable to the items currently in your cart.')
  }

  if (excludedProdIds.length > 0) eligible = eligible.filter((it) => !excludedProdIds.includes(it.id))
  if (excludedCatIds.length > 0) eligible = eligible.filter((it) => !it.categoryIds.some((c) => excludedCatIds.includes(c)))

  if (eligible.length === 0) {
    throw new PricingError('The items in your cart are excluded from this promotion.')
  }

  const eligibleSubtotal = eligible.reduce((sum, it) => sum + it.price * it.quantity, 0)
  const fullSubtotal = args.items.reduce((sum, it) => sum + it.price * it.quantity, 0)

  if (promo.min_order_amount > 0 && fullSubtotal < promo.min_order_amount) {
    throw new PricingError(`Minimum order amount of ৳${promo.min_order_amount} required to use this code.`)
  }

  let discountAmount = 0
  if (promo.discount_type === 'percentage') {
    discountAmount = eligibleSubtotal * (Number(promo.discount_value) / 100)
    if (promo.max_discount > 0 && discountAmount > promo.max_discount) {
      discountAmount = Number(promo.max_discount)
    }
  } else if (promo.discount_type === 'fixed') {
    discountAmount = Math.min(eligibleSubtotal, Number(promo.discount_value))
  } else if (promo.discount_type === 'free_shipping') {
    discountAmount = Number(args.deliveryCharge || 0)
  }

  discountAmount = Math.max(0, Math.round(discountAmount * 100) / 100)
  return { promo, discountAmount }
}
