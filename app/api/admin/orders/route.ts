import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { verifyStaffAuth } from '@/utils/auth'
import { revalidateStockChanges } from '@/utils/revalidate'
import {
  releaseOrderStock, restoreProductStock, deductProductStock, orderHoldsStock, statusHoldsStock, canEditOrderItems,
  shortageOf, describeShortages, StockChange, StockShortage
} from '@/utils/inventory'
import { sendOrderDispatchedEmail, sendOrderCancelledEmail, sendOrderUpdatedEmail, OrderItemChange } from '@/utils/email'
import { resolveProductVariant, PricingError } from '@/utils/order-pricing'

export const dynamic = 'force-dynamic'

const MAX_LINE_QTY = 999
const MAX_ORDER_LINES = 50

interface OrderLine {
  item: any // the order_items row (or, for an added product, the row about to be inserted)
  oldQty: number // 0 for added products
  quantity: number
  price: number
  isNew?: boolean
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin', 'staff'])
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { 
      id, 
      customer_name, 
      customer_phone, 
      customer_email,
      shipping_address, 
      city_id, 
      zone_id, 
      area_id,
      city_name,
      zone_name,
      area_name,
      delivery_charge,
      order_status,
      payment_status,
      advance_paid,
      discount_amount, // optional: adjusted discount after item changes
      items, // array of { id, quantity, price }
      deleted_item_ids, // array of string IDs to remove
      added_items, // array of { product_id, quantity, selected_variations } to add
      notify_customer, // optional: email the customer the updated order
      restock_removed // optional (default true): put removed / reduced units back into stock
    } = body
    const restockRemoved = restock_removed !== false

    if (!id || !customer_name || !customer_phone || !shipping_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // 1. Fetch existing order
    const { data: existingOrder, error: fetchError } = await adminDb
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('id', id)
      .single()

    if (fetchError || !existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const oldStatus = existingOrder.order_status || 'Pending'
    const newStatus = order_status || oldStatus
    const willBeActive = newStatus !== 'Cancelled'
    // See utils/order-stock.ts. `heldStock` = does the order hold stock right now?
    // An order that doesn't (e.g. unpaid bKash) takes it when accepted; cancelling gives it back.
    const heldStock = orderHoldsStock(existingOrder)
    const holdStock = willBeActive && (heldStock || statusHoldsStock(newStatus))

    // 2. Work out the item changes (only lines that belong to this order count)
    const existingItems: any[] = existingOrder.order_items || []
    const existingById = new Map<string, any>(existingItems.map((it) => [String(it.id), it]))

    const deletedIds = new Set<string>(
      (Array.isArray(deleted_item_ids) ? deleted_item_ids : [])
        .map((x: any) => String(x))
        .filter((x: string) => existingById.has(x))
    )

    const requested = new Map<string, { quantity: number; price: number }>()
    if (Array.isArray(items)) {
      for (const it of items) {
        const itemId = String(it?.id || '')
        const existingItem = existingById.get(itemId)
        if (!existingItem || deletedIds.has(itemId)) continue

        const qty = Math.floor(Number(it.quantity))
        if (!Number.isFinite(qty) || qty < 1 || qty > MAX_LINE_QTY) {
          return NextResponse.json({ error: 'Invalid quantity for an item in this order.' }, { status: 400 })
        }
        const price = it.price !== undefined && it.price !== null ? Number(it.price) : Number(existingItem.price)
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'Invalid price for an item in this order.' }, { status: 400 })
        }
        requested.set(itemId, { quantity: qty, price })
      }
    }

    const finalLines: OrderLine[] = existingItems
      .filter((it) => !deletedIds.has(String(it.id)))
      .map((it) => {
        const req = requested.get(String(it.id))
        return {
          item: it,
          oldQty: Number(it.quantity) || 0,
          quantity: req ? req.quantity : Number(it.quantity) || 0,
          price: req ? req.price : Number(it.price) || 0
        }
      })

    // Products the owner added to the order (e.g. the customer forgot one).
    // Priced from the products table exactly like checkout.
    const addedRaw: any[] = Array.isArray(added_items) ? added_items : []
    if (addedRaw.length > 0) {
      if (finalLines.length + addedRaw.length > MAX_ORDER_LINES) {
        return NextResponse.json({ error: `An order can have at most ${MAX_ORDER_LINES} items.` }, { status: 400 })
      }
      const productIds = Array.from(new Set(addedRaw.map((a) => String(a?.product_id || '')).filter(Boolean)))
      const { data: products, error: productsError } = await adminDb
        .from('products')
        .select('id, name, price, stock, variations')
        .in('id', productIds)
      if (productsError) {
        return NextResponse.json({ error: 'Could not load the products to add.' }, { status: 500 })
      }
      const productsById = new Map<string, any>((products || []).map((p: any) => [String(p.id), p]))

      for (const raw of addedRaw) {
        const product = productsById.get(String(raw?.product_id || ''))
        if (!product) {
          return NextResponse.json({ error: 'A product you added no longer exists.' }, { status: 400 })
        }
        const qty = Math.floor(Number(raw.quantity))
        if (!Number.isFinite(qty) || qty < 1 || qty > MAX_LINE_QTY) {
          return NextResponse.json({ error: `Invalid quantity for ${product.name}.` }, { status: 400 })
        }
        let resolved
        try {
          resolved = resolveProductVariant(product, raw.selected_variations)
        } catch (err: any) {
          if (err instanceof PricingError) return NextResponse.json({ error: err.message }, { status: 400 })
          throw err
        }
        finalLines.push({
          item: {
            id: null,
            product_id: product.id,
            selected_variations: resolved.selectedVariations,
            products: { name: product.name }
          },
          oldQty: 0,
          quantity: qty,
          price: resolved.price,
          isNew: true
        })
      }
    }

    if (existingItems.length > 0 && finalLines.length === 0) {
      return NextResponse.json(
        { error: 'An order needs at least one item. To drop everything, cancel the order instead.' },
        { status: 400 }
      )
    }

    // Customer-facing summary of what changed (used for the email and the change history)
    const itemChanges: OrderItemChange[] = []
    for (const it of existingItems) {
      if (deletedIds.has(String(it.id))) {
        itemChanges.push({
          name: it.products?.name || 'Product',
          selectedVariations: it.selected_variations,
          fromQty: Number(it.quantity) || 0,
          toQty: 0
        })
      }
    }
    for (const line of finalLines) {
      if (line.quantity !== line.oldQty) {
        itemChanges.push({
          name: line.item.products?.name || 'Product',
          selectedVariations: line.item.selected_variations,
          fromQty: line.oldQty,
          toQty: line.quantity
        })
      }
    }

    // Validate everything before anything is written
    let discountAmount = Number(existingOrder.discount_amount || 0)
    if (discount_amount !== undefined && discount_amount !== null && discount_amount !== '') {
      const d = Number(discount_amount)
      if (!Number.isFinite(d) || d < 0) {
        return NextResponse.json({ error: 'Invalid discount amount.' }, { status: 400 })
      }
      discountAmount = Math.round(d * 100) / 100
    }

    // Items can be changed on Pending and Confirmed orders, not once shipped or cancelled
    // (the courier already has the parcel and its cash-to-collect amount)
    const priceChanged = finalLines.some((line) => !line.isNew && line.price !== Number(line.item.price))
    if ((itemChanges.length > 0 || priceChanged) && !(canEditOrderItems(oldStatus) && willBeActive)) {
      return NextResponse.json(
        { error: 'Items can only be changed on Pending or Confirmed orders (not after shipping or cancelling).' },
        { status: 400 }
      )
    }

    // 3. Save item changes first, so stock only moves once the order itself is updated
    if (deletedIds.size > 0) {
      const { error: deleteError } = await adminDb
        .from('order_items')
        .delete()
        .in('id', Array.from(deletedIds))
        .eq('order_id', id)

      if (deleteError) {
        console.error('Failed to delete order items:', deleteError)
        return NextResponse.json({ error: 'Failed to remove items from the order.' }, { status: 500 })
      }
    }

    const newLines = finalLines.filter((line) => line.isNew)
    if (newLines.length > 0) {
      const { error: insertError } = await adminDb
        .from('order_items')
        .insert(newLines.map((line) => ({
          order_id: id,
          product_id: line.item.product_id,
          quantity: line.quantity,
          price: line.price,
          selected_variations: line.item.selected_variations
        })))

      if (insertError) {
        console.error('Failed to add order items:', insertError)
        return NextResponse.json({ error: 'Failed to add the new products to the order.' }, { status: 500 })
      }
    }

    for (const line of finalLines) {
      if (line.isNew) continue
      if (line.quantity === line.oldQty && line.price === Number(line.item.price)) continue
      const { error: itemError } = await adminDb
        .from('order_items')
        .update({ quantity: line.quantity, price: line.price })
        .eq('id', line.item.id)
        .eq('order_id', id)

      if (itemError) {
        console.error('Failed to update order item:', itemError)
        return NextResponse.json({ error: 'Failed to update item quantities.' }, { status: 500 })
      }
    }

    // 4. Move stock to match
    const stockChanges: Array<StockChange | null> = []
    const shortages: StockShortage[] = []
    const takeStock = async (line: (typeof finalLines)[number], qty: number) => {
      const change = await deductProductStock(adminDb, line.item.product_id, qty, line.item.selected_variations)
      stockChanges.push(change)
      const short = shortageOf(change, qty, line.item.products?.name || 'Product')
      if (short) shortages.push(short)
    }

    if (heldStock && !holdStock) {
      // Cancelled: give back everything the order was holding (its original quantities)
      for (const it of existingItems) {
        stockChanges.push(await restoreProductStock(adminDb, it.product_id, Number(it.quantity) || 0, it.selected_variations))
      }
    } else if (!heldStock && holdStock) {
      // Accepted (Confirmed / Shipped / ...): take the order's items out of stock now
      for (const line of finalLines) {
        await takeStock(line, line.quantity)
      }
    } else if (heldStock && holdStock) {
      // Still active: take extra stock for increases. Removed lines and reduced quantities go
      // back into stock only when the owner says so: when items were cut because they were
      // never really in stock (inventory out of date), returning them would create phantom stock.
      if (restockRemoved) {
        for (const it of existingItems) {
          if (deletedIds.has(String(it.id))) {
            stockChanges.push(await restoreProductStock(adminDb, it.product_id, Number(it.quantity) || 0, it.selected_variations))
          }
        }
      }
      for (const line of finalLines) {
        const diff = line.quantity - line.oldQty
        if (diff > 0) {
          await takeStock(line, diff)
        } else if (diff < 0 && restockRemoved) {
          stockChanges.push(await restoreProductStock(adminDb, line.item.product_id, -diff, line.item.selected_variations))
        }
      }
    }

    // 5. Recalculate totals
    const itemsSubtotal = finalLines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    const parsedDeliveryCharge = Number(delivery_charge !== undefined ? delivery_charge : existingOrder.delivery_charge) || 0
    const oldTotalPrice = Number(existingOrder.total_price) || 0
    const newTotalPrice = Math.max(0, itemsSubtotal + parsedDeliveryCharge - discountAmount)

    // 6. Update payment_details with shipping metadata, custom advance_paid and change history
    const paymentDetails = existingOrder.payment_details || {}
    paymentDetails.shipping_metadata = {
      ...(paymentDetails.shipping_metadata || {}),
      city_name: city_name || paymentDetails.shipping_metadata?.city_name || '',
      zone_name: zone_name || paymentDetails.shipping_metadata?.zone_name || '',
      area_name: area_name || paymentDetails.shipping_metadata?.area_name || ''
    }

    if (advance_paid !== undefined) {
      paymentDetails.advance_paid = Number(advance_paid)
    }
    paymentDetails.stock_deducted = holdStock

    // A fully paid order whose total went up now has a balance to collect on delivery
    let finalPaymentStatus = payment_status || existingOrder.payment_status
    if (finalPaymentStatus === 'FullyPaid' && newTotalPrice > oldTotalPrice + 0.009) {
      const paid = paymentDetails.advance_paid !== undefined ? Number(paymentDetails.advance_paid) : oldTotalPrice
      if (paid + 0.009 < newTotalPrice) {
        paymentDetails.advance_paid = paid
        finalPaymentStatus = paid > 0 ? 'DeliveryChargePrePaid' : 'Pending'
      }
    }

    const itemsOrTotalChanged = itemChanges.length > 0 || Math.abs(newTotalPrice - oldTotalPrice) >= 0.01
    if (itemChanges.length > 0) {
      const history = Array.isArray(paymentDetails.order_adjustments) ? paymentDetails.order_adjustments : []
      paymentDetails.order_adjustments = [
        ...history,
        {
          at: new Date().toISOString(),
          by: auth.user?.email || null,
          changes: itemChanges.map((c) => ({ name: c.name, from: c.fromQty, to: c.toQty })),
          old_total: oldTotalPrice,
          new_total: newTotalPrice
        }
      ].slice(-20)
    }

    // 7. Update the main order row
    const updatePayload: Record<string, any> = {
      customer_name,
      customer_phone,
      customer_email: customer_email || null,
      shipping_address,
      delivery_charge: parsedDeliveryCharge,
      discount_amount: discountAmount,
      total_price: newTotalPrice,
      payment_details: paymentDetails
    }

    if (city_id !== undefined) updatePayload.city_id = Number(city_id)
    if (zone_id !== undefined) updatePayload.zone_id = Number(zone_id)
    if (area_id !== undefined) updatePayload.area_id = Number(area_id)
    if (order_status) updatePayload.order_status = order_status
    if (finalPaymentStatus && finalPaymentStatus !== existingOrder.payment_status) {
      updatePayload.payment_status = finalPaymentStatus
    } else if (payment_status) {
      updatePayload.payment_status = payment_status
    }

    const { error: updateError } = await adminDb
      .from('orders')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update order:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 8. Fetch complete updated order with items and products
    const { data: updatedOrder, error: reloadError } = await adminDb
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('id', id)
      .single()

    if (reloadError || !updatedOrder) {
      return NextResponse.json({ error: 'Failed to reload updated order' }, { status: 500 })
    }

    // 9. Trigger customer email notification on status change
    const targetEmail = updatedOrder.customer_email || existingOrder.customer_email
    if (targetEmail && oldStatus !== newStatus) {
      if (newStatus === 'Cancelled') {
        sendOrderCancelledEmail({
          toEmail: targetEmail,
          customerName: updatedOrder.customer_name,
          orderId: updatedOrder.id,
          totalPrice: Number(updatedOrder.total_price)
        }).catch(err => console.error('[Email] Order cancelled email error:', err))
      } else if (newStatus === 'Shipped') {
        const courierLabel = updatedOrder.shipping_provider === 'pathao'
          ? 'Pathao Courier'
          : updatedOrder.shipping_provider === 'steadfast'
          ? 'Steadfast Courier'
          : 'Store Courier / Local Delivery'

        let codAmount = 0
        if (updatedOrder.payment_status === 'FullyPaid') {
          codAmount = 0
        } else if (updatedOrder.payment_details?.advance_paid !== undefined) {
          codAmount = Math.max(0, Number(updatedOrder.total_price) - Number(updatedOrder.payment_details.advance_paid))
        } else if (updatedOrder.payment_status === 'DeliveryChargePrePaid') {
          codAmount = Math.max(0, Number(updatedOrder.total_price) - Number(updatedOrder.delivery_charge))
        } else {
          codAmount = Number(updatedOrder.total_price)
        }

        sendOrderDispatchedEmail({
          toEmail: targetEmail,
          customerName: updatedOrder.customer_name,
          orderId: updatedOrder.id,
          courierName: courierLabel,
          consignmentId: updatedOrder.pathao_consignment_id || updatedOrder.steadfast_consignment_id,
          trackingCode: updatedOrder.steadfast_tracking_code,
          shippingAddress: updatedOrder.shipping_address,
          totalPrice: Number(updatedOrder.total_price),
          codAmount,
          paymentStatus: updatedOrder.payment_status
        }).catch(err => console.error('[Email] Order dispatched email error:', err))
      }
    }

    // 10. Tell the customer about adjusted items / totals when the owner asked to
    let customerEmail: { sent: boolean; reason?: string } | undefined
    if (notify_customer && willBeActive && itemsOrTotalChanged) {
      if (!targetEmail) {
        customerEmail = { sent: false, reason: 'No email address on this order.' }
      } else {
        const advance = paymentDetails.advance_paid !== undefined
          ? Number(paymentDetails.advance_paid)
          : updatedOrder.payment_status === 'FullyPaid'
            ? oldTotalPrice
            : updatedOrder.payment_status === 'DeliveryChargePrePaid'
              ? Number(existingOrder.delivery_charge || 0)
              : 0
        const result: any = await sendOrderUpdatedEmail({
          toEmail: targetEmail,
          customerName: updatedOrder.customer_name,
          orderId: updatedOrder.id,
          changes: itemChanges,
          items: (updatedOrder.order_items || []).map((it: any) => ({
            name: it.products?.name || 'Product',
            quantity: Number(it.quantity),
            price: Number(it.price),
            selectedVariations: it.selected_variations || undefined
          })),
          deliveryCharge: Number(updatedOrder.delivery_charge || 0),
          discountAmount: Number(updatedOrder.discount_amount || 0),
          totalPrice: Number(updatedOrder.total_price),
          advancePaid: advance
        }).catch((err: any) => ({ success: false, error: err?.message }))
        customerEmail = result?.success
          ? { sent: true }
          : { sent: false, reason: result?.reason || result?.error || 'Email could not be sent.' }
      }
    }

    // Courier bookings keep the old COD amount; the owner must fix it in the courier panel
    const warnings: string[] = []
    const shortageWarning = describeShortages(shortages)
    if (shortageWarning) warnings.push(shortageWarning)
    const hasConsignment = updatedOrder.pathao_consignment_id || updatedOrder.steadfast_consignment_id
    if (hasConsignment && willBeActive && Math.abs(newTotalPrice - oldTotalPrice) >= 0.01) {
      warnings.push('This order is already booked with the courier. Update the COD (cash to collect) amount in the courier panel to match the new total.')
    }

    // Only stock changes affect the storefront; status/address/payment edits need no refresh
    await revalidateStockChanges(adminDb, stockChanges)
    return NextResponse.json({ success: true, data: updatedOrder, customerEmail, warnings })

  } catch (error: any) {
    console.error('Order Update Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin', 'staff'])
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing order ID parameter' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // 1-2. Give back stock if the order was holding any (accepted and not cancelled)
    const stockChanges: StockChange[] = await releaseOrderStock(adminDb, id)

    // 3. Delete order_items first
    const { error: itemsError } = await adminDb
      .from('order_items')
      .delete()
      .eq('order_id', id)

    if (itemsError) {
      console.error('Failed to delete order items:', itemsError)
    }

    // 4. Delete the order
    const { error: orderError } = await adminDb
      .from('orders')
      .delete()
      .eq('id', id)

    if (orderError) {
      console.error('Failed to delete order:', orderError)
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }

    await revalidateStockChanges(adminDb, stockChanges)
    return NextResponse.json({ success: true, message: 'Order deleted successfully' })
  } catch (error: any) {
    console.error('Order Delete Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
