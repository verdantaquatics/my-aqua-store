import { createClient } from '@/utils/supabase/server'
import { StaffRole, hasFullAccess } from '@/utils/staff'
import { resolveStaffAccess } from '@/utils/staff-access'

export interface AuthCheckResult {
  authorized: boolean
  error?: string
  status?: number
  user?: any
  role?: StaffRole
  staffMember?: any
}

/**
 * Validates whether the incoming request is from an authenticated and active staff member.
 * @param allowedRoles Array of allowed roles (e.g. ['shop_owner', 'admin'] or ['shop_owner', 'admin', 'staff']).
 */
export async function verifyStaffAuth(
  allowedRoles: StaffRole[] = ['shop_owner', 'admin', 'staff']
): Promise<AuthCheckResult> {
  try {
    const userClient = await createClient()
    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
      return { authorized: false, error: 'Authentication required. Please sign in.', status: 401 }
    }

    const access = await resolveStaffAccess(user)

    if (access.status === 'suspended') {
      return { authorized: false, error: 'Your staff account is suspended. Contact the store owner.', status: 403 }
    }

    if (access.status !== 'active' || !access.role) {
      return { authorized: false, error: 'Unauthorized access. Staff account not found.', status: 403 }
    }

    // shop_owner & admin can do everything; plain staff only where 'staff' is allowed
    const isAuthorized = allowedRoles.includes('staff') || hasFullAccess(access.role)

    if (!isAuthorized) {
      return { authorized: false, error: 'You do not have permission to perform this action.', status: 403 }
    }

    return { authorized: true, user, role: access.role, staffMember: access.staffMember }
  } catch (error: any) {
    console.error('verifyStaffAuth error:', error)
    return { authorized: false, error: 'Internal server error during authorization check.', status: 500 }
  }
}
