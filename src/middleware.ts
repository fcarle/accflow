import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log('MIDDLEWARE FUNCTION ENTERED - Path:', request.nextUrl.pathname); // Diagnostic log
  const response = NextResponse.next({
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
      // Role fetching logic was here, but we're simplifying as /admin is removed.
      // If you reinstate role-based access for other routes, you'd re-add role fetching:
      // let userRole = null;
      // const { data: profiles, error: profileError } = await supabase
      //   .from('profiles')
      //   .select('role')
      //   .eq('id', session.user.id)
      // etc.
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