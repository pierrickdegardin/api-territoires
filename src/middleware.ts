import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

let _jwtSecret: Uint8Array | null = null
function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production')
    }
    _jwtSecret = new TextEncoder().encode(secret || 'dev-only-secret-do-not-use-in-production')
  }
  return _jwtSecret
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Routes publiques
  if (
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'
  ) {
    return NextResponse.next()
  }

  // Protéger les routes admin
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_session')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    try {
      await jwtVerify(token, getJwtSecret())
      return NextResponse.next()
    } catch (error) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
