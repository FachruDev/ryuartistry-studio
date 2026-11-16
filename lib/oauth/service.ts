/** OAuth 2.1 server state: clients, authorization codes, and access/refresh tokens. */
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { oauthClients, oauthCodes, oauthTokens } from "@/lib/db/schema-oauth";
import {
  ACCESS_TOKEN_TTL_S,
  AUTH_CODE_TTL_S,
  MCP_SCOPE,
  REFRESH_TOKEN_TTL_S,
  isMetadataDocumentClientId,
  isSafeMetadataHost,
  randomToken,
  sha256,
  validateMetadataDocument,
  verifyPkce,
  type ClientRegistration,
} from "./core";

export type OAuthClient = typeof oauthClients.$inferSelect;

/** OAuth error with the RFC 6749 error code, rendered as JSON by the route handlers. */
export class OAuthError extends Error {
  constructor(
    public code: string,
    description: string,
    public status = 400,
  ) {
    super(description);
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function registerClient(reg: ClientRegistration) {
  const clientId = `rsc_${randomBytes(16).toString("base64url")}`;
  const secret = reg.tokenEndpointAuthMethod === "none" ? null : randomToken("rscs");
  await db.insert(oauthClients).values({
    clientId,
    secretHash: secret ? sha256(secret) : null,
    name: reg.name,
    redirectUris: reg.redirectUris,
    tokenEndpointAuthMethod: reg.tokenEndpointAuthMethod,
    kind: "dcr",
  });
  return { clientId, clientSecret: secret, ...reg };
}

const CIMD_REFRESH_MS = 24 * 3_600_000;

/** Fetches (and caches for a day) a Client ID Metadata Document. */
async function loadMetadataClient(clientId: string, existing: OAuthClient | undefined): Promise<OAuthClient> {
  if (existing && Date.now() - existing.createdAt.getTime() < CIMD_REFRESH_MS) return existing;
  if (!isSafeMetadataHost(clientId)) throw new OAuthError("invalid_client", "Client metadata host is not allowed");
  let doc: unknown;
  try {
    const res = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok || text.length > 64 * 1024) throw new Error(`status ${res.status}`);
    doc = JSON.parse(text);
  } catch {
    if (existing) return existing;
    throw new OAuthError("invalid_client", "Could not fetch the client metadata document");
  }
  const v = validateMetadataDocument(doc, clientId);
  if (!v.ok) throw new OAuthError("invalid_client", v.error);
  const values = { name: v.value.name, redirectUris: v.value.redirectUris, tokenEndpointAuthMethod: "none", kind: "cimd", createdAt: new Date() };
  const [row] = await db
    .insert(oauthClients)
    .values({ clientId, ...values })
    .onConflictDoUpdate({ target: oauthClients.clientId, set: values })
    .returning();
  return row;
}

export async function resolveClient(clientId: string): Promise<OAuthClient> {
  const [existing] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  if (isMetadataDocumentClientId(clientId)) return loadMetadataClient(clientId, existing);
  if (!existing) throw new OAuthError("invalid_client", "Unknown client_id");
  return existing;
}

/** Confidential clients must present their secret; public clients must not need one. */
export function authenticateClient(client: OAuthClient, presentedSecret: string | null): void {
  if (client.tokenEndpointAuthMethod === "none") return;
  if (!presentedSecret || !client.secretHash) throw new OAuthError("invalid_client", "Client authentication failed", 401);
  const a = Buffer.from(sha256(presentedSecret));
  const b = Buffer.from(client.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthError("invalid_client", "Client authentication failed", 401);
}

// ---------------------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------------------

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  agentId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
}): Promise<string> {
  const code = randomToken("rsac");
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    ...input,
    scope: MCP_SCOPE,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_S * 1000),
  });
  return code;
}

async function issueTokens(input: { familyId: string; clientId: string; agentId: string; userId: string; resource: string }) {
  const access = randomToken("rsat");
  const refresh = randomToken("rsrt");
  const now = Date.now();
  await db.insert(oauthTokens).values({
    ...input,
    accessHash: sha256(access),
    refreshHash: sha256(refresh),
    scope: MCP_SCOPE,
    accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000),
  });
  await db.update(oauthClients).set({ lastUsedAt: new Date() }).where(eq(oauthClients.clientId, input.clientId));
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope: MCP_SCOPE };
}

export async function exchangeCode(input: { client: OAuthClient; code: string; redirectUri: string; codeVerifier: string }) {
  const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, sha256(input.code)));
  if (!row || row.usedAt || row.expiresAt < new Date() || row.clientId !== input.client.clientId) {
    // A replayed code may mean it leaked: revoke anything it already produced.
    if (row?.usedAt) await db.update(oauthTokens).set({ revokedAt: new Date() }).where(and(eq(oauthTokens.clientId, row.clientId), eq(oauthTokens.userId, row.userId), isNull(oauthTokens.revokedAt)));
    throw new OAuthError("invalid_grant", "Authorization code is invalid, expired, or already used");
  }
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request");
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed");
  await db.update(oauthCodes).set({ usedAt: new Date() }).where(eq(oauthCodes.codeHash, row.codeHash));
  return issueTokens({ familyId: randomUUID(), clientId: row.clientId, agentId: row.agentId, userId: row.userId, resource: row.resource });
}

/** Refresh-token rotation; presenting an already-rotated refresh token revokes the whole family. */
export async function refreshTokens(input: { client: OAuthClient; refreshToken: string }) {
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.refreshHash, sha256(input.refreshToken)));
  if (!row || row.clientId !== input.client.clientId) throw new OAuthError("invalid_grant", "Unknown refresh token");
  if (row.rotatedAt || row.revokedAt) {
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.familyId, row.familyId));
    throw new OAuthError("invalid_grant", "Refresh token was already used; the connection has been revoked");
  }
  if (row.refreshExpiresAt < new Date()) throw new OAuthError("invalid_grant", "Refresh token expired");
  await db.update(oauthTokens).set({ rotatedAt: new Date() }).where(eq(oauthTokens.id, row.id));
  return issueTokens({ familyId: row.familyId, clientId: row.clientId, agentId: row.agentId, userId: row.userId, resource: row.resource });
}

/** RFC 7009: revoke by access or refresh token; always succeeds from the caller's view. */
export async function revokeToken(token: string, clientId: string): Promise<void> {
  const h = sha256(token);
  const [row] =
    (await db.select().from(oauthTokens).where(eq(oauthTokens.accessHash, h))).concat(
      await db.select().from(oauthTokens).where(eq(oauthTokens.refreshHash, h)),
    );
  if (row && row.clientId === clientId) {
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.familyId, row.familyId));
  }
}

// ---------------------------------------------------------------------------
// Resource server side
// ---------------------------------------------------------------------------

/** Maps an OAuth access token to its agent, checking expiry, revocation and audience. */
export async function agentForAccessToken(token: string, resource: string) {
  const [row] = await db
    .select({ token: oauthTokens, agent: agents })
    .from(oauthTokens)
    .innerJoin(agents, eq(oauthTokens.agentId, agents.id))
    .where(and(eq(oauthTokens.accessHash, sha256(token)), isNull(oauthTokens.revokedAt), gt(oauthTokens.accessExpiresAt, new Date())));
  if (!row || row.token.resource !== resource || !row.agent.active) return null;
  await db.update(oauthTokens).set({ lastUsedAt: new Date() }).where(eq(oauthTokens.id, row.token.id));
  return row.agent;
}

/** Active connections (one row per token family) for the Agents page. */
export async function listConnections() {
  const rows = await db
    .select({ token: oauthTokens, clientName: oauthClients.name, kind: oauthClients.kind })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthTokens.clientId, oauthClients.clientId))
    .where(and(isNull(oauthTokens.revokedAt), isNull(oauthTokens.rotatedAt), gt(oauthTokens.refreshExpiresAt, new Date())))
    .orderBy(desc(oauthTokens.createdAt));
  return rows.map((r) => ({
    familyId: r.token.familyId,
    agentId: r.token.agentId,
    clientName: r.clientName,
    kind: r.kind,
    lastUsedAt: r.token.lastUsedAt,
    createdAt: r.token.createdAt,
  }));
}

export async function revokeConnection(familyId: string): Promise<void> {
  await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.familyId, familyId));
}
