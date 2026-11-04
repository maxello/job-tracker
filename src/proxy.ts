import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

// Optimistic redirect only: it checks that the session cookie exists, not that
// it is valid. Pages and Server Actions validate it with getCurrentUserId().
export function proxy(request: NextRequest) {
  // Server Actions are POSTs: a 307 would replay them against /sign-in, so they
  // pass through and redirect from getCurrentUserId().
  const isRead = request.method === "GET" || request.method === "HEAD";

  // Public paths never redirect on a cookie: a stale one would cause a loop.
  if (!isRead || PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  // Everything except build output and the root-level files from public/.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|[^/]+\\.svg$).*)"],
};
