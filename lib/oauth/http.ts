import { envValue } from "@/lib/auth/session";
import { OAuthError } from "./service";

/**
 * The public origin clients see. Set STUDIO_PUBLIC_URL in production (e.g. https://studio.example.com)
 * so issuer/resource URLs never depend on request headers.
 */
export function publicOrigin(headers: Headers, fallbackUrl?: string): string {
  const fixed = envValue("STUDIO_PUBLIC_URL");
  if (fixed) return fixed.replace(/\/+$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(fallbackUrl ?? "http://localhost:3000").origin;
}

/** Discovery, registration and token endpoints are called cross-origin by browser-based clients. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function oauthError(e: unknown) {
  if (e instanceof OAuthError) return json({ error: e.code, error_description: e.message }, e.status);
  console.error("[oauth] unexpected error", e);
  return json({ error: "server_error", error_description: "Unexpected server error" }, 500);
}

/** Reads form-encoded (spec) or JSON (lenient) request bodies. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  const form = new URLSearchParams(await request.text());
  return Object.fromEntries(form.entries());
}

/** client_secret_basic credentials, if present. */
export function basicAuth(request: Request): { id: string; secret: string } | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(h.slice(6), "base64").toString().split(":");
  return id ? { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") } : null;
}
