/**
 * OAuth 2.1 for the MCP endpoint (MCP authorization spec). Clients are the AI apps (Claude.ai,
 * ChatGPT, Gemini, Grok); each grant binds one client to one studio agent. Secrets, codes and
 * tokens are stored only as sha256 hashes.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./schema";
import { users } from "./schema-auth";

export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Random id for registered clients, or the https URL itself for metadata-document clients. */
  clientId: text("client_id").notNull().unique(),
  /** Only for confidential clients (token_endpoint_auth_method != "none"). */
  secretHash: text("secret_hash"),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  /** "dcr" (dynamic registration) or "cimd" (client id metadata document). */
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope").notNull(),
  resource: text("resource").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** All tokens issued from one authorization share a family; refresh-token reuse revokes the family. */
    familyId: uuid("family_id").notNull(),
    accessHash: text("access_hash").notNull().unique(),
    refreshHash: text("refresh_hash").notNull().unique(),
    clientId: text("client_id").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    /** Audience: the MCP resource URL the token is valid for (RFC 8707). */
    resource: text("resource").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    /** Set when this refresh token was exchanged for a new pair. */
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oauth_tokens_family_idx").on(t.familyId), index("oauth_tokens_agent_idx").on(t.agentId)],
);
