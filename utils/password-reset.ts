import { createAdminClient, createClient } from '@/utils/supabase/server'
import { sendPasswordResetEmail } from '@/utils/email'

/**
 * Email a password reset link (works for customers and staff).
 *
 * Preferred path: generate a one-time recovery token with the admin API and send
 * our own email through Resend. This needs no Supabase SMTP setup and the link
 * works on any device/browser (it's verified server-side at /auth/confirm).
 *
 * Fallback (no Resend key): Supabase's own mailer. On the free plan that only
 * delivers to your Supabase team members unless custom SMTP is configured.
 *
 * Never reveals whether the email has an account.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = String(rawEmail || '').toLowerCase().trim()
  if (!email.includes('@')) return

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const adminDb = createAdminClient()

  const { data, error } = await adminDb.auth.admin.generateLink({ type: 'recovery', email })

  // Unknown email: stay silent so the response doesn't reveal which emails are registered
  if (error || !data?.properties?.hashed_token) return

  const resetUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=/reset-password`
  const sent = await sendPasswordResetEmail({ toEmail: email, resetUrl })

  if (!sent.success) {
    const userClient = await createClient()
    const { error: resetErr } = await userClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?next=/reset-password`
    })
    if (resetErr) console.error('Password reset fallback error:', resetErr.message)
  }
}
