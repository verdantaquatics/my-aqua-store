/*
 * WHEN AN ORDER HOLDS STOCK (shared by the server and the dashboard)
 *
 * - COD and bKash Personal orders take stock as soon as they are placed.
 * - bKash gateway orders take stock once the payment succeeds. Abandoned or failed
 *   payments never hold stock, so they can't lock items as "out of stock".
 * - An order that doesn't hold stock yet takes it when the store accepts it (status moves
 *   past Pending), dispatches it, or the courier picks it up.
 * - Stock is given back when an order is cancelled, returned or deleted.
 *
 * `payment_details.stock_deducted` records whether an order currently holds stock, so
 * stock is never taken twice or given back when it was never taken.
 */

export const ITEM_EDITABLE_STATUSES = ['Pending', 'Confirmed']

const PAID_STATUSES = ['FullyPaid', 'DeliveryChargePrePaid']

/** Whether this order currently holds stock */
export function orderHoldsStock(order: any): boolean {
  const flag = order?.payment_details?.stock_deducted
  if (typeof flag === 'boolean') return flag

  // Orders placed before the flag existed took stock at checkout, except bKash gateway
  // orders that were never paid, and orders already cancelled
  if (order?.order_status === 'Cancelled') return false
  if (order?.payment_status === 'Failed') return false
  if (order?.payment_method === 'BKASH' && !PAID_STATUSES.includes(order?.payment_status)) return false
  return true
}

/** Statuses at which the store has accepted the order, so it must hold stock */
export function statusHoldsStock(status: string | null | undefined): boolean {
  return !!status && status !== 'Pending' && status !== 'Cancelled'
}

/** Items can be changed until the order ships (or is cancelled) */
export function canEditOrderItems(status: string | null | undefined): boolean {
  return ITEM_EDITABLE_STATUSES.includes(status || 'Pending')
}
