import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session-token";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

// Legal pages (footer links on login/signup) — reachable without a session
// like AUTH_PATHS, but never bounce an already-logged-in user away, since
// they may click one of these links from inside the app too.
const LEGAL_PATHS = ["/privacidad", "/terminos", "/cookies"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isLegalPath = LEGAL_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (!session && !isAuthPath && !isLegalPath) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isAuthPath) {
    return NextResponse.redirect(new URL("/pos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Also excludes any path with a file extension (icons, manifest.webmanifest,
  // sw.js, apple-icon.png, etc.) so static/public assets are never redirected
  // to /login on the logged-out screen — that redirect breaks the asset fetch.
  matcher: ["/((?!_next/static|_next/image|api/|.*\\.[\\w]+$).*)"],
};
