import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { StaffRole } from '@/utils/staff'
import { resolveStaffAccess } from '@/utils/staff-access'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired (maintains login state)
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  let isAuthorized = false
  let userRole: StaffRole = 'staff'
  let isSuspended = false

  const needsStaffCheck = pathname.startsWith('/stradmn') || pathname.startsWith('/admin') || pathname === '/login'

  if (user && needsStaffCheck) {
    try {
      const access = await resolveStaffAccess(user)
      isSuspended = access.status === 'suspended'
      isAuthorized = access.status === 'active'
      if (access.role) userRole = access.role
    } catch {
      // Fail closed: treat as unauthorized
    }
  }

  // If visiting /stradmn/login while already logged in as authorized staff -> redirect to /stradmn
  if (pathname === '/stradmn/login') {
    if (isAuthorized && !isSuspended) {
      const url = request.nextUrl.clone()
      url.pathname = '/stradmn'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Protect /stradmn routes
  if (pathname.startsWith('/stradmn')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/stradmn/login'
      return NextResponse.redirect(url)
    }

    if (isSuspended) {
      const url = request.nextUrl.clone()
      url.pathname = '/stradmn/login'
      url.searchParams.set('error', 'suspended')
      return NextResponse.redirect(url)
    }

    if (!isAuthorized) {
      const url = request.nextUrl.clone()
      url.pathname = '/stradmn/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }

    // Role-Based Route Protection:
    // 'staff' role cannot access /stradmn/stats, /stradmn/settings, /stradmn/staff, or /stradmn/promotions
    const isRestrictedForStaff = (
      pathname.startsWith('/stradmn/stats') ||
      pathname.startsWith('/stradmn/settings') ||
      pathname.startsWith('/stradmn/staff') ||
      pathname.startsWith('/stradmn/promotions')
    )

    if (userRole === 'staff' && isRestrictedForStaff) {
      const url = request.nextUrl.clone()
      url.pathname = '/stradmn'
      url.searchParams.set('notice', 'access_restricted')
      return NextResponse.redirect(url)
    }
  }

  // Legacy route protection / redirect
  if (pathname.startsWith('/admin') || pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = isAuthorized ? '/stradmn' : '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
