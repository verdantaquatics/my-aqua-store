import { NextRequest, NextResponse } from 'next/server'
import { getStoreSettings } from '@/utils/settings'
import { sendDailyPendingOrdersSummary } from '@/utils/email'
import { verifyStaffAuth } from '@/utils/auth'
import { isAuthorizedCronRequest } from '@/utils/cron'

export const dynamic = 'force-dynamic'

// GET: Handled by Vercel Cron or external scheduler
export async function GET(request: NextRequest) {
  try {
    // Scheduled runs only; the digest always goes to the configured store email
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
    }

    const settings = await getStoreSettings(true)

    if (!settings.daily_digest_enabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Daily pending orders digest is disabled in store settings.'
      })
    }

    // Only send when the current Bangladesh Time hour matches the scheduled hour
    {
      const scheduledTime = settings.daily_digest_time || '20:00'
      const [scheduledHour] = scheduledTime.split(':').map(Number)

      // Get current hour in Asia/Dhaka time zone (UTC+6)
      const nowDhakaStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: 'numeric',
        hour12: false
      }).format(new Date())

      const currentDhakaHour = parseInt(nowDhakaStr, 10)

      if (currentDhakaHour !== scheduledHour) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: `Current Dhaka hour (${currentDhakaHour}:00) does not match scheduled hour (${scheduledHour}:00).`
        })
      }
    }

    const result = await sendDailyPendingOrdersSummary()
    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('Daily digest cron execution error:', error)
    return NextResponse.json({ error: 'Daily digest cron failed' }, { status: 500 })
  }
}

// POST: Triggered by Admin "Send Test Summary Now" button
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin'])
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const { email } = body

    const result = await sendDailyPendingOrdersSummary(email)
    if (!result.success) {
      return NextResponse.json({ error: result.reason || result.error || 'Failed to send summary email' }, { status: 400 })
    }

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('Daily digest test execution error:', error)
    return NextResponse.json({ error: 'Failed to send summary' }, { status: 500 })
  }
}
