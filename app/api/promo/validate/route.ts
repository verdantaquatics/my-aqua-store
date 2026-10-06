import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { getStoreSettings } from '@/utils/settings'
import { priceCart, evaluatePromo, computeDeliveryCharge, isInsideStoreCity, PricingError } from '@/utils/order-pricing'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const settings = await getStoreSettings()
    const body = await request.json()
    const { code, cartItems = [], customer_phone, customer_email, user_id } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Please enter a promo code.' }, { status: 400 })
    }

    const { items } = await priceCart(supabase, cartItems)
    const deliveryCharge = computeDeliveryCharge(
      settings,
      isInsideStoreCity(settings, {
        pathaoActive: settings.pathao_enabled === true,
        cityName: body.city_name,
        cityId: Number(body.city_id || 0),
        region: body.delivery_region
      })
    )

    const { promo, discountAmount } = await evaluatePromo(supabase, {
      code,
      items,
      deliveryCharge,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      userId: user_id || null
    })

    return NextResponse.json({
      valid: true,
      code: promo.code,
      promoId: promo.id,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountAmount,
      message: promo.discount_type === 'free_shipping'
        ? 'Free shipping applied!'
        : `৳${discountAmount} discount applied successfully!`
    })
  } catch (err: any) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Validate promo error:', err)
    return NextResponse.json({ error: 'Failed to validate promo code.' }, { status: 500 })
  }
}
