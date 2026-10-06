import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { checkSteadfastStatus, checkPathaoStatus } from '@/utils/courier'
import { restoreOrderInventory } from '@/utils/inventory'
import { phoneVariants } from '@/utils/postgrest'

const TRACK_COLUMNS = 'id, created_at, customer_name, customer_phone, shipping_address, order_status, payment_status, payment_method, payment_details, total_price, delivery_charge, discount_amount, shipping_provider, pathao_status, pathao_consignment_id, steadfast_consignment_id, steadfast_tracking_code, order_items(id, quantity, price, selected_variations, products(name, images))'

function maskPhone(phone = '') {
  return phone.length > 5 ? `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}` : '***'
}

// Only what the tracking page needs. Lookups by phone or short ID hide the full
// address/phone, since those identifiers are easy to know or guess.
function toPublicOrder(order: any, full: boolean) {
  const { payment_details, ...rest } = order
  return {
    ...rest,
    payment_details: payment_details?.advance_paid !== undefined ? { advance_paid: payment_details.advance_paid } : {},
    customer_name: full ? order.customer_name : String(order.customer_name || '').split(' ')[0],
    customer_phone: full ? order.customer_phone : maskPhone(order.customer_phone || ''),
    shipping_address: full ? order.shipping_address : 'Hidden for privacy. Search with the full Order ID from your invoice to see it.'
  }
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawQuery = (searchParams.get('query') || '').trim()

    if (!rawQuery || rawQuery.length < 8 || rawQuery.length > 64) {
      return NextResponse.json({ error: 'Please enter a valid Order ID or Phone number' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // Clean phone query if numeric
    const isNumericQuery = /^[\d\s+\-()]{6,}$/.test(rawQuery)
    const digitsOnly = rawQuery.replace(/\D/g, '')

    let orders: any[] = []
    let fullDetails = false

    if (isNumericQuery) {
      // Search by the complete mobile number only (e.g. 017XXXXXXXX)
      const local = digitsOnly.startsWith('88') ? digitsOnly.slice(2) : digitsOnly
      if (local.length !== 11) {
        return NextResponse.json({ error: 'Please enter your full 11-digit mobile number or Order ID' }, { status: 400 })
      }
      const { data, error } = await adminDb
        .from('orders')
        .select(TRACK_COLUMNS)
        .in('customer_phone', phoneVariants(local))
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Track by phone error:', error)
      } else if (data) {
        orders = data
      }
    } else {
      // Check if full UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawQuery)

      if (isUUID) {
        fullDetails = true
        const { data, error } = await adminDb
          .from('orders')
          .select(TRACK_COLUMNS)
          .eq('id', rawQuery)
          .limit(1)

        if (error) {
          console.error('Track by UUID error:', error)
        } else if (data) {
          orders = data
        }
      } else {
        // Short ID prefix search (the 8-character ID printed on invoices)
        const cleanQuery = rawQuery.toLowerCase().replace(/^#/, '')
        if (!/^[0-9a-f-]{8,}$/.test(cleanQuery)) {
          return NextResponse.json({ success: true, orders: [] })
        }
        const { data, error } = await adminDb
          .from('orders')
          .select(TRACK_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(500)

        if (error) {
          console.error('Track prefix error:', error)
        } else if (data) {
          orders = data.filter((o: any) =>
            o.id.toLowerCase().startsWith(cleanQuery) ||
            o.id.replace(/-/g, '').toLowerCase().startsWith(cleanQuery.replace(/-/g, ''))
          )
        }
      }
    }

    // Live Sync with Courier for active shipments
    if (orders.length > 0) {
      for (const order of orders) {
        const isCompleted = order.order_status === 'Completed' || order.order_status === 'Delivered' || order.order_status === 'Cancelled'
        const hasConsignment = order.steadfast_consignment_id || order.pathao_consignment_id

        if (!isCompleted && hasConsignment) {
          try {
            let deliveryStatus = ''
            if (order.steadfast_consignment_id) {
              const res = await checkSteadfastStatus(order.steadfast_consignment_id, order.steadfast_tracking_code)
              deliveryStatus = res.delivery_status
            } else if (order.pathao_consignment_id) {
              const res = await checkPathaoStatus(order.pathao_consignment_id)
              deliveryStatus = res.delivery_status
            }

            const s = deliveryStatus.toLowerCase().replace(/[-_]/g, ' ').trim()

            if (s.includes('delivered') || s.includes('partial delivered') || s.includes('payment invoice settled') || s.includes('payment settled')) {
              order.order_status = 'Completed'
              order.payment_status = 'FullyPaid'
              order.pathao_status = 'delivered'
              await adminDb.from('orders').update({
                order_status: 'Completed',
                payment_status: 'FullyPaid',
                pathao_status: 'delivered'
              }).eq('id', order.id)
            } else if (s.includes('return') || s.includes('cancelled') || s.includes('canceled')) {
              if (order.order_status !== 'Cancelled') {
                await restoreOrderInventory(adminDb, order.id)
              }
              order.order_status = 'Cancelled'
              order.pathao_status = 'returned'
              await adminDb.from('orders').update({
                order_status: 'Cancelled',
                pathao_status: 'returned'
              }).eq('id', order.id)
            }
          } catch (err: any) {
            console.warn(`Track live courier sync failed for ${order.id}:`, err.message)
          }
        }
      }
    }

    return NextResponse.json({ success: true, orders: orders.map((o) => toPublicOrder(o, fullDetails)) })

  } catch (error: any) {
    console.error('Order tracking API error:', error)
    return NextResponse.json({ error: 'Error looking up order' }, { status: 500 })
  }
}
