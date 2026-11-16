/**
 * Pure OAuth 2.1 pieces for the MCP authorization spec: discovery metadata, PKCE, redirect URI
 * and client-registration validation. No I/O, so it is unit-tested directly.
 */
import { createHash, randomBytes } from "node:crypto";

export const MCP_SCOPE = "mcp";
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60; // 30 days
export const AUTH_CODE_TTL_S = 120;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");

/** High-entropy opaque token; only its sha256 is stored. */
export function randomToken(prefix: string): string {
  return `${prefix}_${b64url(randomBytes(32))}`;
}

export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

/** RFC 9728 protected resource metadata. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Ryuartistry Studio MCP",
  };
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
  };
}

/** PKCE S256: base64url(sha256(verifier)) must equal the stored challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return b64url(createHash("sha256").update(verifier).digest()) === challenge;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https anywhere, or http only on loopback (native/CLI clients). No fragments. */
export function isValidRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK.has(u.hostname);
}

export type ClientRegistration = {
  name: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
};

/** RFC 7591 request validation. Returns the normalized registration or an error description. */
export function validateRegistration(body: unknown): { ok: true; value: ClientRegistration } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    return { ok: false, error: "redirect_uris must be a non-empty array (max 10)" };
  }
  if (!uris.every((u) => typeof u === "string" && u.length <= 500 && isValidRedirectUri(u))) {
    return { ok: false, error: "redirect_uris must be https URLs (or http on localhost)" };
  }
  const method = (b.token_endpoint_auth_method ?? "none") as string;
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return { ok: false, error: "Unsupported token_endpoint_auth_method" };
  }
  const grants = (b.grant_types ?? ["authorization_code"]) as unknown;
  if (!Array.isArray(grants) || !grants.every((g) => g === "authorization_code" || g === "refresh_token")) {
    return { ok: false, error: "Only authorization_code and refresh_token grants are supported" };
  }
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 100) : "Klien MCP";
  return { ok: true, value: { name, redirectUris: uris as string[], tokenEndpointAuthMethod: method as ClientRegistration["tokenEndpointAuthMethod"] } };
}

/** A client_id that is an https URL with a path is a Client ID Metadata Document. */
export function isMetadataDocumentClientId(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Refuse metadata URLs that point at the server's own network (basic SSRF guard). */
export function isSafeMetadataHost(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  if (LOOPBACK.has(host) || host === "0.0.0.0") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false; // IP literals
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || !host.includes(".")) return false;
  return true;
}

/** Validates a fetched Client ID Metadata Document against the URL it came from. */
export function validateMetadataDocument(doc: unknown, url: string): { ok: true; value: ClientRegistration } | { ok: false; error: string } {
  if (!doc || typeof doc !== "object" || (doc as Record<string, unknown>).client_id !== url) {
    return { ok: false, error: "client_id in the metadata document must equal its URL" };
  }
  const r = validateRegistration(doc);
  if (!r.ok) return r;
  // Metadata-document clients are public clients.
  return { ok: true, value: { ...r.value, tokenEndpointAuthMethod: "none" } };
}

/** Requested resource (RFC 8707) must be our MCP endpoint when given. */
export function resourceMatches(requested: string | null | undefined, origin: string): boolean {
  if (!requested) return true;
  return requested.replace(/\/+$/, "") === mcpResourceUrl(origin);
}
