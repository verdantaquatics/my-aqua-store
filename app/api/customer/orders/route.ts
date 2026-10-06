import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/utils/supabase/server'
import { ilikeExact } from '@/utils/postgrest'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userClient = await createClient()
    const { data: { user }, error: authErr } = await userClient.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = createAdminClient()
    const cleanEmail = user.email?.toLowerCase().trim() || ''

    // 1. Resolve the customer record linked to this login
    const { data: customer } = await adminDb
      .from('customers')
      .select('id')
      .or(`user_id.eq.${user.id},email.ilike.${ilikeExact(cleanEmail)}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Only orders linked to this account (or placed with its login email) are returned.
    // Guest orders placed with the customer's phone are linked to the account at
    // signup/login; matching on the editable profile phone here would let anyone
    // read other people's orders by changing their phone number.
    const conditions: string[] = [`user_id.eq.${user.id}`]
    if (cleanEmail) conditions.push(`customer_email.ilike.${ilikeExact(cleanEmail)}`)
    if (customer?.id) conditions.push(`customer_id.eq.${customer.id}`)

    // 2. Fetch orders
    const { data: orders, error: ordersErr } = await adminDb
      .from('orders')
      .select('*, order_items(*, products(name, images, slug))')
      .or(conditions.join(','))
      .order('created_at', { ascending: false })

    if (ordersErr) throw ordersErr

    return NextResponse.json({ orders: orders || [] })
  } catch (error: any) {
    console.error('Customer orders fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch customer orders' }, { status: 500 })
  }
}
