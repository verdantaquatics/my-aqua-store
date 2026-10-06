import { NextResponse } from 'next/server'
import { verifyStaffAuth } from '@/utils/auth'

export const dynamic = 'force-dynamic'

// GET: Current dashboard user's staff role (used by the admin login page & sidebar)
export async function GET() {
  const auth = await verifyStaffAuth(['shop_owner', 'admin', 'staff'])
  if (!auth.authorized) {
    return NextResponse.json({ authorized: false, error: auth.error }, { status: auth.status || 403 })
  }

  return NextResponse.json({
    authorized: true,
    role: auth.role,
    email: auth.user?.email || '',
    full_name: auth.staffMember?.full_name || auth.user?.email?.split('@')[0] || ''
  })
}
