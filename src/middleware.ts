import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  try {
    const { data: { session } } = await supabase.auth.getSession()

    console.log('Middleware - Current path:', request.nextUrl.pathname)
    console.log('Middleware - Session exists:', !!session)
    if (session) {
      console.log('Middleware - User email:', session.user.email)
      let userRole = null; // Initialize userRole

      // Fetch user's profile to check their role
      console.log('Middleware - Fetching profile for user ID:', session.user.id)
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        // Removed .single() to handle multiple/no rows gracefully

      if (profileError) {
        console.error('Middleware - Error fetching profiles:', profileError.message)
        // Treat as non-admin for safety
      } else if (!profiles || profiles.length === 0) {
        console.log('Middleware - No profile found for user ID:', session.user.id)
        // No profile means no role, treat as non-admin
      } else if (profiles.length > 1) {
        console.warn('Middleware - Multiple profiles found for user ID:', session.user.id, 'Using role from the first profile found, but this indicates a data issue.')
        // This case should ideally not happen if 'id' is a unique primary key
        // For safety, you might want to treat this as non-admin or investigate the duplicates.
        // For now, we'll take the role from the first one found, but log a strong warning.
        userRole = profiles[0].role
        console.log('Middleware - User role (from first of multiple profiles):', userRole)
      } else {
        // Exactly one profile found
        userRole = profiles[0].role
        console.log('Middleware - User role from profile:', userRole)
      }

      // If user tries to access /admin, check their role
      if (request.nextUrl.pathname.startsWith('/admin')) {
        if (userRole !== 'admin') {
          console.log(`Middleware - Access to /admin DENIED. User role: "${userRole}". Redirecting to dashboard.`)
          const redirectUrl = new URL('/dashboard', request.url)
          return NextResponse.redirect(redirectUrl)
        } else {
          console.log('Middleware - Admin access to /admin GRANTED.')
          // Allow access, continue to the page by returning the original response or NextResponse.next()
        }
      }
    }

    // Allow access to static files and API routes
    if (
      request.nextUrl.pathname.startsWith('/_next') ||
      request.nextUrl.pathname.startsWith('/api') ||
      request.nextUrl.pathname.startsWith('/static')
    ) {
      return response
    }

    // If user is not signed in and the current path is not /login or /signup
    // redirect the user to /login
    if (!session && !['/login', '/signup'].includes(request.nextUrl.pathname)) {
      console.log('Middleware - Redirecting to login')
      const redirectUrl = new URL('/login', request.url)
      return NextResponse.redirect(redirectUrl)
    }

    // If user is signed in and the current path is /login or /signup
    // redirect the user to /dashboard
    if (session && ['/login', '/signup'].includes(request.nextUrl.pathname)) {
      console.log('Middleware - Redirecting to dashboard')
      const redirectUrl = new URL('/dashboard', request.url)
      return NextResponse.redirect(redirectUrl)
    }

    return response
  } catch (error) {
    console.error('Middleware error:', error)
    return response
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
} 