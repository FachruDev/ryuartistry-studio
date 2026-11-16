import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";

/**
 * Gate for the dashboard. Checks the cookie signature AND the account in the database (still
 * active, same session version), before anything renders: a page-level check alone is not
 * enough, because Suspense boundaries keep streaming data after a redirect in a sibling.
 */
async function signedIn(request: NextRequest): Promise<boolean> {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return false;
  const user = await getUserById(session.uid);
  return Boolean(user && user.active && user.sessionVersion === session.v);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const ok = await signedIn(request);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(ok ? "/dashboard" : "/login", request.url));
  }
  if (pathname === "/login") {
    return ok ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }
  if (!ok) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(url);
    // Drop a cookie that no longer maps to a valid session.
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
