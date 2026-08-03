import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// requireSession() (lib/session.ts) redirects here instead of straight to
// /login when getSession()'s DB check finds the session invalid (company or
// user deleted, or user suspended mid-session). That redirect happens during
// a Server Component render, which can't call cookies().delete() itself —
// only a Server Function or Route Handler can. Without this hop, the stale
// but still cryptographically-valid cookie would survive the redirect and
// proxy.ts would bounce the visitor straight back from /login to /pos,
// looping forever. This route is excluded from proxy's matcher (anything
// under api/), so it's reached directly with no interference.
export async function GET(request: NextRequest) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url));
}
