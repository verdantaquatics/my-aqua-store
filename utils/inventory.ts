import { SupabaseClient } from '@supabase/supabase-js'

/** Total stock of a product before and after an inventory update */
export interface StockChange {
  productId: string
  before: number
  after: number
  /** Deductions only: units of the chosen product/variant that were in stock beforehand */
  available?: number
}

/** A deduction that asked for more units than were in stock (stock was floored at 0) */
export interface StockShortage {
  productId: string
  name: string
  requested: number
  available: number
}

// When an order holds stock: see utils/order-stock.ts
import { orderHoldsStock, statusHoldsStock } from '@/utils/order-stock'
export { orderHoldsStock, statusHoldsStock, canEditOrderItems } from '@/utils/order-stock'

export function shortageOf(change: StockChange | null, requested: number, name: string): StockShortage | null {
  if (!change || change.available === undefined || change.available >= requested) return null
  return { productId: change.productId, name, requested, available: change.available }
}

export function describeShortages(shortages: StockShortage[]): string | null {
  if (shortages.length === 0) return null
  const lines = shortages.map((s) => `• ${s.name}: needed ${s.requested}, only ${s.available} in stock`)
  return `Not enough stock for:\n${lines.join('\n')}\nThe stock for these is now 0. If you can't supply them, edit the order to reduce or remove them.`
}

async function loadOrderForStock(db: SupabaseClient, orderId: string) {
  const { data } = await db
    .from('orders')
    .select('id, order_status, payment_status, payment_method, payment_details')
    .eq('id', orderId)
    .maybeSingle()
  return data
}

async function setStockFlag(db: SupabaseClient, orderId: string, paymentDetails: any, value: boolean) {
  await db
    .from('orders')
    .update({ payment_details: { ...(paymentDetails || {}), stock_deducted: value } })
    .eq('id', orderId)
}

/** Take the order's items out of stock, unless it already holds stock */
export async function takeOrderStock(
  db: SupabaseClient,
  orderId: string
): Promise<{ changes: StockChange[]; shortages: StockShortage[] }> {
  const order = await loadOrderForStock(db, orderId)
  if (!order || orderHoldsStock(order)) return { changes: [], shortages: [] }

  const { data: items } = await db
    .from('order_items')
    .select('product_id, quantity, selected_variations, products(name)')
    .eq('order_id', orderId)

  const changes: StockChange[] = []
  const shortages: StockShortage[] = []
  for (const item of items || []) {
    const qty = Number(item.quantity) || 0
    const change = await deductProductStock(db, item.product_id, qty, item.selected_variations)
    if (change) changes.push(change)
    const short = shortageOf(change, qty, (item as any).products?.name || 'Product')
    if (short) shortages.push(short)
  }
  await setStockFlag(db, orderId, order.payment_details, true)
  return { changes, shortages }
}

/** Put the order's items back into stock, if it holds stock */
export async function releaseOrderStock(db: SupabaseClient, orderId: string): Promise<StockChange[]> {
  const order = await loadOrderForStock(db, orderId)
  if (!order || !orderHoldsStock(order)) return []

  const changes = await restoreOrderInventory(db, orderId)
  await setStockFlag(db, orderId, order.payment_details, false)
  return changes
}

/**
 * Bring stock in line with an order moving to `newStatus`. Call it BEFORE saving the
 * new status. Returns `holdsStock` so callers that save payment_details from an older
 * copy of the order can keep the flag.
 */
export async function syncOrderStock(
  db: SupabaseClient,
  orderId: string,
  newStatus: string | null | undefined
): Promise<{ changes: StockChange[]; shortages: StockShortage[]; holdsStock: boolean }> {
  if (newStatus === 'Cancelled') {
    const changes = await releaseOrderStock(db, orderId)
    return { changes, shortages: [], holdsStock: false }
  }
  if (statusHoldsStock(newStatus)) {
    const result = await takeOrderStock(db, orderId)
    return { ...result, holdsStock: true }
  }
  const order = await loadOrderForStock(db, orderId)
  return { changes: [], shortages: [], holdsStock: orderHoldsStock(order) }
}

/**
 * Increment / restore stock for a single product and its selected variations
 */
export async function restoreProductStock(
  supabase: SupabaseClient,
  productId: string,
  quantity: number,
  selectedVariations?: Record<string, string> | null
): Promise<StockChange | null> {
  if (!productId || quantity <= 0) return null

  const { data: prod, error } = await supabase
    .from('products')
    .select('id, stock, variations')
    .eq('id', productId)
    .single()

  if (error || !prod) {
    console.error(`Failed to fetch product ${productId} for stock restoration:`, error)
    return null
  }
  const before = Number(prod.stock) || 0

  let updatedVariations = prod.variations
  if (
    updatedVariations &&
    typeof updatedVariations === 'object' &&
    Array.isArray(updatedVariations.options) &&
    updatedVariations.options.length > 0
  ) {
    const selectedVar = selectedVariations || {}
    updatedVariations.options = updatedVariations.options.map((opt: any) => {
      const selectedVal = selectedVar[opt.name] || selectedVar[opt.name?.toLowerCase()]
      if (selectedVal && Array.isArray(opt.values)) {
        opt.values = opt.values.map((v: any) => {
          if (v.label === selectedVal && typeof v.stock === 'number') {
            v.stock = (Number(v.stock) || 0) + quantity
          }
          return v
        })
      }
      return opt
    })

    const primaryOpt = updatedVariations.options[0]
    const totalStock = primaryOpt && Array.isArray(primaryOpt.values)
      ? primaryOpt.values.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
      : (Number(prod.stock) || 0) + quantity

    await supabase
      .from('products')
      .update({ stock: totalStock, variations: updatedVariations })
      .eq('id', productId)
    return { productId, before, after: totalStock }
  } else {
    const after = before + quantity
    await supabase
      .from('products')
      .update({ stock: after })
      .eq('id', productId)
    return { productId, before, after }
  }
}

/**
 * Decrement / deduct stock for a single product and its selected variations
 */
export async function deductProductStock(
  supabase: SupabaseClient,
  productId: string,
  quantity: number,
  selectedVariations?: Record<string, string> | null
): Promise<StockChange | null> {
  if (!productId || quantity <= 0) return null

  const { data: prod, error } = await supabase
    .from('products')
    .select('id, stock, variations')
    .eq('id', productId)
    .single()

  if (error || !prod) {
    console.error(`Failed to fetch product ${productId} for stock deduction:`, error)
    return null
  }
  const before = Number(prod.stock) || 0

  let updatedVariations = prod.variations
  if (
    updatedVariations &&
    typeof updatedVariations === 'object' &&
    Array.isArray(updatedVariations.options) &&
    updatedVariations.options.length > 0
  ) {
    const selectedVar = selectedVariations || {}
    // Units of the chosen variant that were available before this deduction
    let available = Infinity
    updatedVariations.options = updatedVariations.options.map((opt: any) => {
      const selectedVal = selectedVar[opt.name] || selectedVar[opt.name?.toLowerCase()]
      if (selectedVal && Array.isArray(opt.values)) {
        opt.values = opt.values.map((v: any) => {
          if (v.label === selectedVal && typeof v.stock === 'number') {
            available = Math.min(available, Number(v.stock) || 0)
            v.stock = Math.max(0, (Number(v.stock) || 0) - quantity)
          }
          return v
        })
      }
      return opt
    })

    const primaryOpt = updatedVariations.options[0]
    const totalStock = primaryOpt && Array.isArray(primaryOpt.values)
      ? primaryOpt.values.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
      : Math.max(0, (Number(prod.stock) || 0) - quantity)

    await supabase
      .from('products')
      .update({ stock: totalStock, variations: updatedVariations })
      .eq('id', productId)
    return { productId, before, after: totalStock, available: available === Infinity ? before : available }
  } else {
    const after = Math.max(0, before - quantity)
    await supabase
      .from('products')
      .update({ stock: after })
      .eq('id', productId)
    return { productId, before, after, available: before }
  }
}

/**
 * Restore inventory for all items in an order (e.g. when order is cancelled or deleted)
 */
export async function restoreOrderInventory(supabase: SupabaseClient, orderId: string): Promise<StockChange[]> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity, selected_variations')
    .eq('order_id', orderId)

  if (error || !items || items.length === 0) return []

  const changes: StockChange[] = []

  for (const item of items) {
    const change = await restoreProductStock(
      supabase,
      item.product_id,
      Number(item.quantity) || 0,
      item.selected_variations
    )
    if (change) changes.push(change)
  }
  return changes
}

/**
 * Deduct inventory for all items in an order (e.g. when a cancelled order is reactivated)
 */
export async function deductOrderInventory(supabase: SupabaseClient, orderId: string): Promise<StockChange[]> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity, selected_variations')
    .eq('order_id', orderId)

  if (error || !items || items.length === 0) return []

  const changes: StockChange[] = []

  for (const item of items) {
    const change = await deductProductStock(
      supabase,
      item.product_id,
      Number(item.quantity) || 0,
      item.selected_variations
    )
    if (change) changes.push(change)
  }
  return changes
}
