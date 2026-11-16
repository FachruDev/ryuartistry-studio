import { createHash, timingSafeEqual } from "node:crypto";

/**
 * HTTP Basic auth for the human dashboard. Credentials come from
 * STUDIO_DASHBOARD_USER (default "admin") and STUDIO_DASHBOARD_PASSWORD.
 * With no password configured the dashboard is closed.
 */
export function isDashboardAuthorized(authorization: string | null): boolean {
  const password = process.env.STUDIO_DASHBOARD_PASSWORD;
  if (!password || !authorization?.startsWith("Basic ")) return false;
  const user = process.env.STUDIO_DASHBOARD_USER ?? "admin";

  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(decoded), digest(`${user}:${password}`));
}
