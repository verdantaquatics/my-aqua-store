import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { sendInvoiceEmail } from '@/utils/email'
import { verifyStaffAuth } from '@/utils/auth'

export const dynamic = 'force-dynamic'

// POST: (Re)send an order invoice email - dashboard only
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin', 'staff'])
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()
    const body = await request.json()
    const { order_id } = body

    if (!order_id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('id', order_id)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (!order.customer_email) {
      return NextResponse.json({ message: 'No email address on file for this order' })
    }

    const emailItems = (order.order_items || []).map((item: any) => ({
      name: item.products?.name || 'Product',
      quantity: item.quantity,
      price: Number(item.price),
      selectedVariations: item.selected_variations
    }))

    const result = await sendInvoiceEmail({
      toEmail: order.customer_email,
      customerName: order.customer_name,
      orderId: order.id,
      createdAt: order.created_at,
      shippingAddress: order.shipping_address,
      customerPhone: order.customer_phone,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      deliveryCharge: Number(order.delivery_charge),
      totalPrice: Number(order.total_price),
      discountAmount: Number(order.discount_amount || 0),
      items: emailItems
    })

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('Invoice email route error:', error)
    return NextResponse.json({ error: 'Failed to send invoice email' }, { status: 500 })
  }
}
