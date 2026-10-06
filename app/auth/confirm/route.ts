import { NextRequest, NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

// Only allow redirects to paths on this site
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

/**
 * Landing route for links in auth emails (password reset).
 * Verifies the one-time token server-side, which signs the user in via cookies,
 * then forwards them to `next` (e.g. /reset-password).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  const supabase = await createClient()
  let ok = false

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    // Links sent by Supabase's own mailer (fallback path)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  const target = ok
    ? new URL(next, request.url)
    : new URL('/reset-password?error=expired', request.url)
  return NextResponse.redirect(target)
}
