import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { StaffRole, normalizeStaffRole } from '@/utils/staff'

export interface StaffAccess {
  status: 'active' | 'suspended' | 'none'
  role?: StaffRole
  staffMember?: any
}

interface AuthUserLike {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

// Service-role client without next/headers so it can also run inside middleware
function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Single source of truth for dashboard access.
 * Access is granted ONLY by an active row in public.staff_members linked to the auth user.
 * Never trust user_metadata (customers can edit it) or patterns in the email address.
 */
export async function resolveStaffAccess(user: AuthUserLike): Promise<StaffAccess> {
  const db = createServiceClient()

  const { data: linked } = await db
    .from('staff_members')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)

  let staff = linked && linked.length > 0 ? linked[0] : null

  // A row pre-provisioned by email (no auth user linked yet) is claimed by the
  // first login of that address, but only once the address is confirmed.
  if (!staff && user.email && user.email_confirmed_at) {
    const { data: pending } = await db
      .from('staff_members')
      .select('*')
      .eq('email', user.email.toLowerCase().trim())
      .is('user_id', null)
      .limit(1)

    if (pending && pending.length > 0) {
      staff = { ...pending[0], user_id: user.id }
      await db.from('staff_members').update({ user_id: user.id }).eq('id', pending[0].id)
    }
  }

  if (!staff) return { status: 'none' }
  if (staff.status === 'suspended') return { status: 'suspended', staffMember: staff }
  return { status: 'active', role: normalizeStaffRole(staff.role), staffMember: staff }
}

/**
 * Returns true if an email belongs to a staff account. Used to stop the public
 * customer signup from registering an address that has been provisioned as staff.
 */
export async function isStaffEmail(email: string): Promise<boolean> {
  const db = createServiceClient()
  const { data } = await db
    .from('staff_members')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .limit(1)
  return Boolean(data && data.length > 0)
}
