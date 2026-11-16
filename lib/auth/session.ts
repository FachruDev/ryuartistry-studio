/**
 * Dashboard sessions: an HMAC-signed cookie carrying the user id and that user's session
 * version. Accounts and passwords live in the database (lib/auth/users.ts), not in env vars.
 * The only env value here is the signing key STUDIO_SESSION_SECRET (at least 32 characters).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "studio_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Session = { uid: string; user: string; v: number; exp: number };

/**
 * Reads an env value the way people actually paste it into hosting dashboards: trims spaces
 * and newlines and strips one pair of wrapping quotes ("value" or 'value').
 */
export function envValue(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const unquoted = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  return unquoted || undefined;
}

function secret(): string | null {
  const s = envValue("STUDIO_SESSION_SECRET");
  return s && s.length >= 32 ? s : null;
}

/** Missing server settings that make login impossible, named so the operator can fix them. */
export function authConfigProblems(): string[] {
  return secret() ? [] : ["STUDIO_SESSION_SECRET belum diatur atau kurang dari 32 karakter"];
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function createSessionToken(user: { id: string; username: string; sessionVersion: number }, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("STUDIO_SESSION_SECRET belum diatur (minimal 32 karakter)");
  const session: Session = { uid: user.id, user: user.username, v: user.sessionVersion, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const payload = b64(JSON.stringify(session));
  return `${payload}.${sign(payload, key)}`;
}

/** Signature + expiry only (cheap, used by the proxy). Server code also checks the database. */
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
    return typeof s.uid === "string" && typeof s.v === "number" && s.exp * 1000 > now ? s : null;
  } catch {
    return null;
  }
}

/**
 * Only same-site destinations are valid after login (no open redirects): dashboard pages, and
 * the OAuth consent page with its query string (an AI app waiting for approval).
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (/^\/dashboard(\/[\w\-/]*)?(\?[\w=&\-]*)?$/.test(next)) return next;
  if (/^\/oauth\/authorize\?[\w\-.~%&=+:/]+$/.test(next)) return next;
  return "/dashboard";
}
