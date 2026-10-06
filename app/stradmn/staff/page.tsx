import { createAdminClient } from '@/utils/supabase/server'
import AdminStaffClient from '@/components/AdminStaffClient'
import { StaffMember } from '@/utils/staff'

export const revalidate = 0 // Disable cache for live staff management

export default async function AdminStaffPage() {
  const supabase = createAdminClient()

  const { data: staffData } = await supabase
    .from('staff_members')
    .select('*')
    .order('created_at', { ascending: false })

  const initialStaff: StaffMember[] = staffData || []

  return <AdminStaffClient initialStaff={initialStaff} />
}
