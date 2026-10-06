import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Only the dashboard (and its legacy URLs) needs the session check + staff gate.
  // Storefront pages don't read the session on the server (customer state is
  // handled in the browser and API routes verify auth themselves), so skipping
  // them avoids a Supabase Auth round trip on every page view and keeps them cacheable.
  matcher: ['/stradmn/:path*', '/admin/:path*', '/login'],
}
