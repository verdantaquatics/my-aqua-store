import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/utils/supabase/server'
import { getStoreSettings, StoreSettings } from '@/utils/settings'
import { bookPathaoConsignment, bookSteadfastConsignment } from '@/utils/courier'
import { sendInvoiceEmail } from '@/utils/email'
import { deductOrderInventory } from '@/utils/inventory'
import { revalidateStorefront } from '@/utils/revalidate'
import { orValue, ilikeExact, phoneVariants } from '@/utils/postgrest'
import {
  priceCart,
  evaluatePromo,
  computeDeliveryCharge,
  isInsideStoreCity,
  PricingError
} from '@/utils/order-pricing'
import axios from 'axios'

export const dynamic = 'force-dynamic'

const PAID_STATUSES = ['FullyPaid', 'DeliveryChargePrePaid']
const PAYMENT_METHODS = ['COD', 'BKASH', 'BKASH_PERSONAL']
const SHIPPING_PROVIDERS = ['pathao', 'steadfast', 'manual']

function bkashConfig(settings: StoreSettings) {
  return {
    apiUrl: settings.bkash_api_url || process.env.BKASH_API_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    appKey: settings.bkash_app_key || process.env.BKASH_APP_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  }
}

// Amount the customer must pay through the bKash merchant gateway for this order
function gatewayAmount(order: { payment_method: string; delivery_charge: any; total_price: any }) {
  return Number(order.payment_method === 'COD' ? order.delivery_charge : order.total_price)
}

// 1. GET BKASH AUTHENTICATION TOKEN (Using DB Settings)
async function getBkashToken() {
  const settings = await getStoreSettings()
  const BKASH_API_URL = bkashConfig(settings).apiUrl
  const BKASH_APP_KEY = settings.bkash_app_key || process.env.BKASH_APP_KEY
  const BKASH_APP_SECRET = settings.bkash_app_secret || process.env.BKASH_APP_SECRET
  const BKASH_USERNAME = settings.bkash_username || process.env.BKASH_USERNAME
  const BKASH_PASSWORD = settings.bkash_password || process.env.BKASH_PASSWORD

  if (!BKASH_APP_KEY || !BKASH_APP_SECRET || !BKASH_USERNAME || !BKASH_PASSWORD) {
    throw new Error('bKash credentials are not configured in settings.')
  }

  try {
    const response = await axios.post(`${BKASH_API_URL}/tokenized/checkout/token/grant`, {
      app_key: BKASH_APP_KEY,
      app_secret: BKASH_APP_SECRET
    }, {
      headers: {
        username: BKASH_USERNAME,
        password: BKASH_PASSWORD,
        'Content-Type': 'application/json'
      }
    })
    return response.data.id_token
  } catch (error: any) {
    console.error('bKash Token Grant Error:', error.response?.data || error.message)
    throw new Error('bKash Authentication Failed')
  }
}

async function createBkashPayment(settings: StoreSettings, order: any, isRetry = false) {
  const { apiUrl, appKey, appUrl } = bkashConfig(settings)
  const token = await getBkashToken()

  const callbackURL = `${appUrl}/api/bkash?order_id=${encodeURIComponent(order.id)}${isRetry ? '&is_retry=true' : ''}`

  const bkashResponse = await axios.post(`${apiUrl}/tokenized/checkout/create`, {
    mode: '0011',
    payerReference: order.customer_phone,
    callbackURL,
    amount: gatewayAmount(order).toFixed(2),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber: order.id
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-app-key': appKey
    }
  })

  return bkashResponse.data?.bkashURL as string | undefined
}

// 2. API POST: CREATE OR RETRY BKASH PAYMENT
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const settings = await getStoreSettings()
    const body = await request.json()

    // Branch 1: RETRY PAYMENT FOR EXISTING ORDER
    if (body.action === 'retry' && body.order_id) {
      const { data: existingOrder, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', body.order_id)
        .single()

      if (fetchErr || !existingOrder) {
        return NextResponse.json({ error: 'Order not found for payment retry' }, { status: 404 })
      }

      if (PAID_STATUSES.includes(existingOrder.payment_status) || existingOrder.order_status === 'Cancelled') {
        return NextResponse.json({ error: 'This order cannot be paid again.' }, { status: 400 })
      }

      if (existingOrder.payment_method === 'BKASH_PERSONAL') {
        return NextResponse.json({ error: 'This order is awaiting manual bKash verification.' }, { status: 400 })
      }

      const checkoutUrl = await createBkashPayment(settings, existingOrder, true)
      if (checkoutUrl) {
        return NextResponse.json({ checkoutUrl, orderId: existingOrder.id })
      }

      return NextResponse.json({ error: 'Failed to generate bKash payment URL' }, { status: 500 })
    }

    // Branch 2: NEW ORDER CREATION
    const {
      customer_name,
      customer_phone,
      shipping_address,
      city_id = 0,
      zone_id = 0,
      area_id = 0,
      city_name,
      zone_name,
      area_name,
      delivery_region,
      payment_method,
      promo_code,
      sender_number,
      transaction_id,
      cartItems
    } = body

    const customer_email = body.customer_email ? String(body.customer_email).trim().toLowerCase() : null

    if (!customer_name || !customer_phone || !shipping_address || !Array.isArray(cartItems) || cartItems.length === 0) {
      return NextResponse.json({ error: 'Missing required order details' }, { status: 400 })
    }

    if (!PAYMENT_METHODS.includes(payment_method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }

    const methodEnabled =
      (payment_method === 'COD' && settings.cod_enabled !== false) ||
      (payment_method === 'BKASH' && settings.bkash_enabled !== false) ||
      (payment_method === 'BKASH_PERSONAL' && settings.bkash_personal_enabled && settings.bkash_personal_number)
    if (!methodEnabled) {
      return NextResponse.json({ error: 'This payment method is currently unavailable.' }, { status: 400 })
    }

    const requestedProvider = String(body.shipping_provider || settings.active_shipping_provider || 'pathao')
    const shipping_provider = SHIPPING_PROVIDERS.includes(requestedProvider) ? requestedProvider : 'manual'

    // Server-side pricing (never trust amounts from the browser)
    const { items, subtotal } = await priceCart(supabase, cartItems)
    const delivery_charge = computeDeliveryCharge(
      settings,
      isInsideStoreCity(settings, {
        pathaoActive: settings.pathao_enabled === true,
        cityName: city_name,
        cityId: Number(city_id || 0),
        region: delivery_region
      })
    )

    // Customer identity comes from the session, never from the request body
    const userClient = await createClient()
    const { data: { user: sessionUser } } = await userClient.auth.getUser()

    let finalCustomerId: string | null = null
    let finalUserId: string | null = null
    let isOwnAccount = false

    if (sessionUser) {
      const { data: ownCustomer } = await supabase
        .from('customers')
        .select('id, user_id')
        .eq('user_id', sessionUser.id)
        .limit(1)
        .maybeSingle()
      finalUserId = sessionUser.id
      finalCustomerId = ownCustomer?.id || null
      isOwnAccount = Boolean(ownCustomer)
    } else {
      // Guest checkout: attach the order to the account registered with this phone/email
      try {
        const matchConditions: string[] = []
        if (customer_email) matchConditions.push(`email.ilike.${ilikeExact(customer_email)}`)
        phoneVariants(customer_phone).forEach((p) => matchConditions.push(`phone.eq.${orValue(p)}`))

        if (matchConditions.length > 0) {
          const { data: matchedCust } = await supabase
            .from('customers')
            .select('id, user_id')
            .or(matchConditions.join(','))
            .limit(1)

          if (matchedCust && matchedCust.length > 0) {
            finalCustomerId = matchedCust[0].id
            finalUserId = matchedCust[0].user_id || null
          }
        }
      } catch (err) {
        console.warn('Customer resolution note:', err)
      }
    }

    let discount_amount = 0
    let promoRecord: any = null
    if (promo_code) {
      const result = await evaluatePromo(supabase, {
        code: promo_code,
        items,
        deliveryCharge: delivery_charge,
        customerPhone: customer_phone,
        customerEmail: customer_email || undefined,
        userId: finalUserId
      })
      discount_amount = result.discountAmount
      promoRecord = result.promo
    }

    const total_price = Math.max(0, subtotal + delivery_charge - discount_amount)

    const isBkashPersonal = payment_method === 'BKASH_PERSONAL'
    // COD with advance delivery charge collected by "Send Money" to the personal number
    const isPersonalPrepay = payment_method === 'COD' && settings.cod_prepay_delivery &&
      Boolean(sender_number || transaction_id || (settings.bkash_personal_enabled && !settings.bkash_enabled))
    const needsGateway = payment_method === 'BKASH' || (payment_method === 'COD' && settings.cod_prepay_delivery && !isPersonalPrepay)

    const shippingMetadata = { city_name, zone_name, area_name, shipping_provider }
    const paymentDetails: Record<string, any> = {
      sender_number: sender_number ? String(sender_number).slice(0, 30) : '',
      transaction_id: transaction_id ? String(transaction_id).slice(0, 60) : '',
      shipping_metadata: shippingMetadata
    }
    if (isPersonalPrepay) paymentDetails.advance_paid = delivery_charge

    // Step A: Insert order in Supabase database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: finalUserId,
        customer_id: finalCustomerId,
        customer_name,
        customer_phone,
        customer_email,
        shipping_address,
        shipping_provider,
        city_id: Number(city_id || 0),
        zone_id: Number(zone_id || 0),
        area_id: Number(area_id || 0),
        delivery_charge,
        total_price,
        payment_method,
        payment_status: isBkashPersonal || isPersonalPrepay ? 'Pending Verification' : 'Pending',
        promo_code: promoRecord?.code || '',
        promo_code_id: promoRecord?.id || null,
        discount_amount,
        payment_details: paymentDetails
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('Order creation error:', orderError)
      return NextResponse.json({ error: 'Failed to create order record' }, { status: 500 })
    }

    // Auto-save delivery address for the logged-in customer's own profile
    if (isOwnAccount && finalCustomerId) {
      await supabase
        .from('customers')
        .update({
          address: shipping_address,
          city_id: Number(city_id || 0),
          zone_id: Number(zone_id || 0),
          area_id: Number(area_id || 0),
          updated_at: new Date().toISOString()
        })
        .eq('id', finalCustomerId)
    }

    // Step B: Save order items (server-side prices)
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(items.map((item) => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        price: item.price,
        selected_variations: item.selectedVariations
      })))

    if (itemsError) {
      console.error('Order items insertion error:', itemsError)
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 })
    }

    // Step C: If promo code used, increment usage_count
    if (promoRecord) {
      try {
        await supabase
          .from('promo_codes')
          .update({ usage_count: (promoRecord.usage_count || 0) + 1 })
          .eq('id', promoRecord.id)
      } catch (err) {
        console.error('Failed to increment promo code usage count:', err)
      }
    }

    const emailItems = items.map((c) => ({
      name: c.name,
      quantity: c.quantity,
      price: c.price,
      selectedVariations: c.selectedVariations
    }))

    // Step D: Orders confirmed without the merchant gateway (bKash Personal / plain COD)
    if (!needsGateway) {
      await deductOrderInventory(supabase, order.id)
      revalidateStorefront()

      if (customer_email) {
        const paymentLabel = isBkashPersonal
          ? 'bKash Personal (Send Money)'
          : isPersonalPrepay ? 'Cash on Delivery (Advance Paid via bKash)' : 'Cash on Delivery (100%)'
        const statusLabel = isBkashPersonal
          ? 'Pending Verification'
          : isPersonalPrepay ? 'Advance Paid (Pending Verification)' : 'Pending'

        sendInvoiceEmail({
          toEmail: customer_email,
          customerName: customer_name,
          orderId: order.id,
          createdAt: order.created_at,
          shippingAddress: shipping_address,
          customerPhone: customer_phone,
          paymentMethod: paymentLabel,
          paymentStatus: statusLabel,
          deliveryCharge: delivery_charge,
          totalPrice: total_price,
          discountAmount: discount_amount,
          items: emailItems
        }).catch((err) => console.error('Error sending order invoice email:', err))
      }

      return NextResponse.json({
        checkoutUrl: `/order/confirmation?order_id=${order.id}`,
        orderId: order.id
      })
    }

    // Step E: Create bKash merchant payment link
    const checkoutUrl = await createBkashPayment(settings, order)
    if (checkoutUrl) {
      return NextResponse.json({ checkoutUrl, orderId: order.id })
    }

    return NextResponse.json({ error: 'Failed to generate bKash payment URL' }, { status: 500 })

  } catch (error: any) {
    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Create Payment Error:', error.message)
    return NextResponse.json({ error: 'Payment initiation failed. Please try again.' }, { status: 500 })
  }
}

// 3. API GET: BKASH REDIRECT CALLBACK & EXECUTE PAYMENT
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const paymentID = searchParams.get('paymentID')
  const status = searchParams.get('status')
  const orderId = searchParams.get('order_id')
  const isRetry = searchParams.get('is_retry') === 'true'

  const settings = await getStoreSettings()
  const { apiUrl: BKASH_API_URL, appKey: BKASH_APP_KEY, appUrl: NEXT_PUBLIC_APP_URL } = bkashConfig(settings)
  const supabase = createAdminClient()

  const failedUrl = (reason: string) =>
    `${NEXT_PUBLIC_APP_URL}/order/failed?order_id=${encodeURIComponent(orderId || '')}&reason=${encodeURIComponent(reason)}&is_retry=${isRetry}`

  if (!orderId) {
    return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/order/failed?error=MissingOrderId`)
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) {
    return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/order/failed?error=OrderNotFound`)
  }

  // Already paid (e.g. callback opened twice) -> nothing to do
  if (PAID_STATUSES.includes(order.payment_status)) {
    return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/order/confirmation?order_id=${order.id}`)
  }

  // Only orders still waiting for a gateway payment can be marked as failed from here
  const markFailed = async (details?: any) => {
    await supabase
      .from('orders')
      .update(details ? { payment_status: 'Failed', payment_details: { ...(order.payment_details || {}), failure: details } } : { payment_status: 'Failed' })
      .eq('id', order.id)
      .in('payment_status', ['Pending', 'Failed'])
  }

  if (status !== 'success' || !paymentID) {
    await markFailed()
    return NextResponse.redirect(failedUrl(status || 'PaymentCancelled'))
  }

  try {
    const token = await getBkashToken()

    const executeResponse = await axios.post(`${BKASH_API_URL}/tokenized/checkout/execute`, {
      paymentID
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-app-key': BKASH_APP_KEY
      }
    })

    const result = executeResponse.data

    if (result.statusCode === '0000' && result.transactionStatus === 'Completed') {
      // The payment must belong to THIS order and cover the full amount due.
      // Without this, a small payment for one order could be replayed against another order's callback.
      const expectedAmount = gatewayAmount(order)
      const paidAmount = Number(result.amount)
      if (result.merchantInvoiceNumber !== order.id || !(paidAmount + 0.01 >= expectedAmount)) {
        console.error('bKash payment does not match order', {
          orderId: order.id,
          invoice: result.merchantInvoiceNumber,
          paidAmount,
          expectedAmount
        })
        await supabase
          .from('orders')
          .update({ payment_details: { ...(order.payment_details || {}), mismatched_payment: result } })
          .eq('id', order.id)
        return NextResponse.redirect(failedUrl('PaymentMismatch'))
      }

      const paymentStatus = order.payment_method === 'COD' ? 'DeliveryChargePrePaid' : 'FullyPaid'
      const codAmount = order.payment_method === 'COD'
        ? Number(order.total_price) - Number(order.delivery_charge)
        : 0

      const shippingProvider = order.shipping_provider || settings.active_shipping_provider || 'pathao'
      let pathaoConsignmentId: string | null = null
      let steadfastConsignmentId: string | null = null
      let steadfastTrackingCode: string | null = null

      if (shippingProvider === 'steadfast') {
        const steadfastResult = await bookSteadfastConsignment(order, codAmount)
        if (steadfastResult) {
          steadfastConsignmentId = steadfastResult.consignment_id
          steadfastTrackingCode = steadfastResult.tracking_code
        }
      } else if (shippingProvider === 'pathao') {
        pathaoConsignmentId = await bookPathaoConsignment(order, codAmount)
      }

      await supabase
        .from('orders')
        .update({
          payment_status: paymentStatus,
          shipping_provider: shippingProvider,
          payment_details: {
            ...(order.payment_details || {}),
            trx_id: result.trxID,
            payment_id: result.paymentID,
            amount: result.amount,
            customer_bkash_number: result.customerMsisdn,
            payload: result
          },
          pathao_consignment_id: pathaoConsignmentId,
          pathao_status: (pathaoConsignmentId || steadfastConsignmentId) ? 'dispatched' : 'pending',
          steadfast_consignment_id: steadfastConsignmentId,
          steadfast_tracking_code: steadfastTrackingCode
        })
        .eq('id', order.id)

      // Decrement stock now that payment is confirmed
      await deductOrderInventory(supabase, order.id)
      revalidateStorefront()

      // Send invoice email asynchronously if customer provided email
      if (order.customer_email) {
        const { data: fullItems } = await supabase
          .from('order_items')
          .select('*, products(name)')
          .eq('order_id', order.id)

        sendInvoiceEmail({
          toEmail: order.customer_email,
          customerName: order.customer_name,
          orderId: order.id,
          createdAt: order.created_at,
          shippingAddress: order.shipping_address,
          customerPhone: order.customer_phone,
          paymentMethod: `bKash Online (${paymentStatus})`,
          paymentStatus: paymentStatus,
          deliveryCharge: Number(order.delivery_charge),
          totalPrice: Number(order.total_price),
          discountAmount: Number(order.discount_amount || 0),
          items: (fullItems || []).map((c: any) => ({
            name: c.products?.name || 'Product',
            quantity: c.quantity,
            price: Number(c.price),
            selectedVariations: c.selected_variations
          }))
        }).catch((err) => console.error('Error sending invoice email in bKash callback:', err))
      }

      return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/order/confirmation?order_id=${order.id}&trx_id=${encodeURIComponent(result.trxID || '')}`)
    }

    console.error('bKash Execution Failure Status:', result)
    await markFailed(result)
    return NextResponse.redirect(failedUrl(result.statusMessage || 'ExecutionFailed'))

  } catch (error: any) {
    console.error('bKash Execute Callback Exception:', error.message)
    await markFailed()
    return NextResponse.redirect(failedUrl('ServerError'))
  }
}
