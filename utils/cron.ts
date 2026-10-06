import { NextRequest } from 'next/server'

/**
 * Cron endpoints must present `Authorization: Bearer <CRON_SECRET>`.
 * Fails closed: if CRON_SECRET isn't configured, scheduled calls are rejected.
 * (Vercel Cron sends this header automatically when CRON_SECRET is set.)
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not set; rejecting cron request.')
    return false
  }
  return request.headers.get('authorization') === `Bearer ${secret}`
}
