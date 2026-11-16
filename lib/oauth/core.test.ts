import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  authorizationServerMetadata,
  isMetadataDocumentClientId,
  isSafeMetadataHost,
  isValidRedirectUri,
  protectedResourceMetadata,
  resourceMatches,
  validateMetadataDocument,
  validateRegistration,
  verifyPkce,
} from "./core";

const origin = "https://studio.example.com";

test("discovery metadata points at our endpoints", () => {
  expect(protectedResourceMetadata(origin)).toMatchObject({ resource: `${origin}/api/mcp`, authorization_servers: [origin] });
  const as = authorizationServerMetadata(origin);
  expect(as.issuer).toBe(origin);
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  expect(as.registration_endpoint).toBe(`${origin}/oauth/register`);
});

test("PKCE S256", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  expect(verifyPkce(verifier, challenge)).toBe(true);
  expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
  expect(verifyPkce("short", challenge)).toBe(false);
});

describe("redirect URIs", () => {
  test.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["https://chatgpt.com/connector_platform_oauth_redirect", true],
    ["http://localhost:6274/callback", true],
    ["http://127.0.0.1:33418/cb", true],
    ["http://evil.example/cb", false],
    ["https://x.example/cb#frag", false],
    ["javascript:alert(1)", false],
  ])("%s → %s", (uri, ok) => expect(isValidRedirectUri(uri)).toBe(ok));
});

test("registration validation", () => {
  const ok = validateRegistration({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"] });
  expect(ok).toEqual({ ok: true, value: { name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"], tokenEndpointAuthMethod: "none" } });
  expect(validateRegistration({ redirect_uris: [] }).ok).toBe(false);
  expect(validateRegistration({ redirect_uris: ["http://evil.example/cb"] }).ok).toBe(false);
  expect(validateRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] }).ok).toBe(false);
});

test("real-world registrations with extra grants, auth methods and redirect URIs are narrowed, not rejected", () => {
  // Shape seen from hosted client metadata documents: more grant types than we support,
  // an auth method we do not implement, and a non-web redirect next to the https one.
  const r = validateRegistration({
    client_name: "ChatGPT",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect", "com.openai.chat://oauth/callback"],
    grant_types: ["authorization_code", "refresh_token", "client_credentials", "urn:ietf:params:oauth:grant-type:device_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "private_key_jwt",
  });
  expect(r).toEqual({
    ok: true,
    value: { name: "ChatGPT", redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"], tokenEndpointAuthMethod: "none" },
  });
  const url = "https://chatgpt.com/oauth/client-metadata.json";
  const doc = { client_id: url, client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/cb"], grant_types: ["authorization_code", "refresh_token", "implicit"], token_endpoint_auth_method: "private_key_jwt" };
  expect(validateMetadataDocument(doc, url)).toEqual({ ok: true, value: { name: "ChatGPT", redirectUris: ["https://chatgpt.com/cb"], tokenEndpointAuthMethod: "none" } });
});

test("client id metadata documents", () => {
  const url = "https://claude.ai/oauth/claude-code-client-metadata";
  expect(isMetadataDocumentClientId(url)).toBe(true);
  expect(isMetadataDocumentClientId("abc123")).toBe(false);
  expect(isSafeMetadataHost(url)).toBe(true);
  expect(isSafeMetadataHost("https://127.0.0.1/meta")).toBe(false);
  expect(isSafeMetadataHost("https://localhost/meta")).toBe(false);
  expect(isSafeMetadataHost("https://metadata.internal/x")).toBe(false);
  expect(validateMetadataDocument({ client_id: url, client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] }, url).ok).toBe(true);
  expect(validateMetadataDocument({ client_id: "https://other.example/x", redirect_uris: ["https://claude.ai/cb"] }, url).ok).toBe(false);
});

test("resource indicator must be our MCP endpoint", () => {
  expect(resourceMatches(undefined, origin)).toBe(true);
  expect(resourceMatches(`${origin}/api/mcp/`, origin)).toBe(true);
  expect(resourceMatches("https://other.example/api/mcp", origin)).toBe(false);
});
