/**
 * The customer-facing order number, e.g. "3F2A9C1B". The same number is used as
 * the invoice number, in emails, on courier bookings and for order tracking.
 */
export function formatOrderNumber(orderId: string): string {
  return String(orderId || '').slice(0, 8).toUpperCase()
}
