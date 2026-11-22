import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple middleware that allows all routes to pass through
// Authentication is handled client-side in the components using localStorage
export default function middleware(request: NextRequest) {
  // Allow all requests to proceed
  // Authentication is handled in the AuthContext and components
  return NextResponse.next();
}

// Don't run middleware on static files, API routes, or specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image files
     */
    '/((?!api|_next/static|_next/image|favicon|robots.txt|sitemap.xml).*)',
  ],
};