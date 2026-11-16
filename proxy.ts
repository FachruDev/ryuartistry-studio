import { NextResponse, type NextRequest } from "next/server";
import { isDashboardAuthorized } from "@/lib/dashboard-auth";

/** Optimistic Basic-auth gate for the dashboard. Server actions check again on their own. */
export function proxy(request: NextRequest) {
  if (!isDashboardAuthorized(request.headers.get("authorization"))) {
    return new NextResponse("Butuh login dashboard", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Ryuartistry Studio", charset="UTF-8"' },
    });
  }
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
