/**
 * Dashboard sessions: an HMAC-signed cookie (no session table needed for a single operator).
 * Credentials: STUDIO_DASHBOARD_USER (default "admin") + STUDIO_DASHBOARD_PASSWORD.
 * Signing key: STUDIO_SESSION_SECRET (at least 32 characters). Changing it logs everyone out.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "studio_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type Session = { user: string; exp: number };

function secret(): string | null {
  const s = process.env.STUDIO_SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function createSessionToken(user: string, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("STUDIO_SESSION_SECRET belum diatur (minimal 32 karakter)");
  const payload = b64(JSON.stringify({ user, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS } satisfies Session));
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): Session | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return typeof s.user === "string" && s.exp * 1000 > now ? s : null;
  } catch {
    return null;
  }
}

/** Constant-time credential check against the configured operator account. */
export function checkCredentials(user: string, password: string): boolean {
  const expectedPassword = process.env.STUDIO_DASHBOARD_PASSWORD;
  if (!expectedPassword) return false;
  const expectedUser = process.env.STUDIO_DASHBOARD_USER ?? "admin";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(`${user}\n${password}`), digest(`${expectedUser}\n${expectedPassword}`));
}

/** Only same-site dashboard paths are valid post-login destinations (no open redirects). */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/dashboard(\/[\w\-/]*)?(\?[\w=&\-]*)?$/.test(next) ? next : "/dashboard";
}

// ---------------------------------------------------------------------------
// Login throttling (in memory, per server instance)
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const globalForAuth = globalThis as unknown as { studioLoginAttempts?: Map<string, { count: number; resetAt: number }> };
const attempts = (globalForAuth.studioLoginAttempts ??= new Map());

/** Returns seconds to wait when the key is locked out, else 0. */
export function lockedFor(key: string, now = Date.now()): number {
  const a = attempts.get(key);
  if (!a || a.resetAt <= now) return 0;
  return a.count >= MAX_ATTEMPTS ? Math.ceil((a.resetAt - now) / 1000) : 0;
}

export function recordFailure(key: string, now = Date.now()): void {
  const a = attempts.get(key);
  if (!a || a.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else a.count++;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
