/**
 * End-to-end OAuth 2.1 smoke test of the MCP endpoint, the way Claude.ai / ChatGPT do it.
 * The operator's approval is simulated with the same service call the consent page uses.
 *
 *   bun --env-file=.env --env-file=.env.local scripts/smoke-oauth.ts [baseUrl]
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { oauthClients, oauthCodes, oauthTokens } from "@/lib/db/schema-oauth";
import { createAuthorizationCode } from "@/lib/oauth/service";
import { operatorCookie } from "./lib/operator-cookie";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const clientIds: string[] = [];
const step = (m: string) => console.log(`✓ ${m}`);
function expect(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}
const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

async function run() {
  // 1. Discovery starts from a 401
  const anon = await fetch(new URL("/api/mcp", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const www = anon.headers.get("www-authenticate") ?? "";
  const metaUrl = www.match(/resource_metadata="([^"]+)"/)?.[1];
  expect(anon.status === 401 && metaUrl, `401 must carry resource_metadata: ${www}`);
  const prm = await (await fetch(metaUrl)).json();
  const as = await (await fetch(new URL("/.well-known/oauth-authorization-server", prm.authorization_servers[0]))).json();
  expect(prm.resource.endsWith("/api/mcp") && as.code_challenge_methods_supported.includes("S256"), "metadata");
  step(`discovery: 401 → ${new URL(metaUrl).pathname} → authorization server (PKCE S256, DCR, CIMD)`);

  // 2. Dynamic client registration
  const reg = await (await fetch(as.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Smoke Claude", redirect_uris: ["https://example.com/callback"], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }) })).json();
  clientIds.push(reg.client_id);
  const badReg = await fetch(as.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
  expect(reg.client_id?.startsWith("rsc_") && !reg.client_secret && badReg.status === 400, "registration");
  step("pendaftaran klien otomatis; redirect http non-localhost ditolak");

  // 3. Consent page needs a signed-in operator
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl = `${as.authorization_endpoint}?${new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://example.com/callback", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: prm.resource })}`;
  const anonConsent = await (await fetch(authUrl)).text();
  expect(anonConsent.includes("/login"), "consent must require login");
  const consent = await (await fetch(authUrl, { headers: { Cookie: await operatorCookie() } })).text();
  expect(consent.includes("Smoke Claude") && consent.includes("Hubungkan sebagai agen"), "consent page");
  const badRedirect = await (await fetch(authUrl.replace(encodeURIComponent("https://example.com/callback"), encodeURIComponent("https://attacker.example/cb")), { headers: { Cookie: await operatorCookie() } })).text();
  expect(badRedirect.includes("tidak terdaftar"), "unregistered redirect_uri must be refused on our page");
  step("halaman persetujuan butuh login; redirect_uri yang tidak terdaftar ditolak");

  // 4. Operator approves as Rina (same call the consent action makes)
  const [rina] = await db.select().from(agents).where(eq(agents.role, "rina"));
  const [admin] = await db.select().from(users).where(eq(users.role, "superadmin")).limit(1);
  const code = await createAuthorizationCode({ clientId: reg.client_id, userId: admin.id, agentId: rina.id, redirectUri: "https://example.com/callback", codeChallenge: challenge, resource: prm.resource });

  const wrongPkce = await (await fetch(as.token_endpoint, form({ grant_type: "authorization_code", code, redirect_uri: "https://example.com/callback", client_id: reg.client_id, code_verifier: randomBytes(32).toString("base64url") }))).json();
  expect(wrongPkce.error === "invalid_grant", JSON.stringify(wrongPkce));
  const tok = await (await fetch(as.token_endpoint, form({ grant_type: "authorization_code", code, redirect_uri: "https://example.com/callback", client_id: reg.client_id, code_verifier: verifier }))).json();
  expect(tok.access_token?.startsWith("rsat_") && tok.refresh_token && tok.expires_in === 3600, JSON.stringify(tok));
  step("tukar kode: PKCE salah ditolak, PKCE benar → access token 1 jam + refresh token");

  // 5. MCP as Rina
  const mcp = new Client({ name: "smoke-oauth", version: "0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
  const who = JSON.parse(((await mcp.callTool({ name: "whoami", arguments: {} })).content as { text: string }[])[0].text);
  const tools = (await mcp.listTools()).tools.map((t) => t.name);
  expect(who.role === "rina" && tools.includes("submit_research_session") && !tools.includes("submit_idea"), JSON.stringify(who));
  await mcp.close();
  step(`MCP dengan token OAuth → bertindak sebagai ${who.name}, hanya tools Rina (${tools.length})`);

  // 6. Code replay revokes what the code produced (it may have leaked)
  const listTools = (token: string) =>
    fetch(new URL("/api/mcp", base), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const replay = await (await fetch(as.token_endpoint, form({ grant_type: "authorization_code", code, redirect_uri: "https://example.com/callback", client_id: reg.client_id, code_verifier: verifier }))).json();
  expect(replay.error === "invalid_grant" && (await listTools(tok.access_token)).status === 401, "code replay must fail and revoke its tokens");
  step("kode yang dipakai ulang ditolak dan token hasil kode itu ikut dicabut");

  // 7. Refresh rotation and reuse detection, on a fresh authorization
  const codeR = await createAuthorizationCode({ clientId: reg.client_id, userId: admin.id, agentId: rina.id, redirectUri: "https://example.com/callback", codeChallenge: challenge, resource: prm.resource });
  const tokR = await (await fetch(as.token_endpoint, form({ grant_type: "authorization_code", code: codeR, redirect_uri: "https://example.com/callback", client_id: reg.client_id, code_verifier: verifier }))).json();
  const r1 = await (await fetch(as.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tokR.refresh_token, client_id: reg.client_id }))).json();
  expect(r1.access_token && r1.refresh_token !== tokR.refresh_token && (await listTools(r1.access_token)).status === 200, `refresh rotation: ${JSON.stringify(r1)}`);
  const reuse = await (await fetch(as.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tokR.refresh_token, client_id: reg.client_id }))).json();
  expect(reuse.error === "invalid_grant", "refresh reuse must fail");
  const afterReuse = await fetch(new URL("/api/mcp", base), { method: "POST", headers: { Authorization: `Bearer ${r1.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(afterReuse.status === 401 && (afterReuse.headers.get("www-authenticate") ?? "").includes("invalid_token"), `family revoked: ${afterReuse.status}`);
  step("refresh berotasi; refresh lama dipakai ulang → seluruh koneksi dicabut");

  // 8. Revocation endpoint
  const code2 = await createAuthorizationCode({ clientId: reg.client_id, userId: admin.id, agentId: rina.id, redirectUri: "https://example.com/callback", codeChallenge: challenge, resource: prm.resource });
  const tok2 = await (await fetch(as.token_endpoint, form({ grant_type: "authorization_code", code: code2, redirect_uri: "https://example.com/callback", client_id: reg.client_id, code_verifier: verifier }))).json();
  const rev = await fetch(as.revocation_endpoint, form({ token: tok2.refresh_token, client_id: reg.client_id }));
  const afterRevoke = await fetch(new URL("/api/mcp", base), { method: "POST", headers: { Authorization: `Bearer ${tok2.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(rev.status === 200 && afterRevoke.status === 401, "revocation");
  step("endpoint revoke mencabut akses dan refresh sekaligus");

  console.log("\nOAUTH SMOKE TEST PASSED");
}

try {
  await run();
} catch (e) {
  console.error("\nOAUTH SMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  if (clientIds.length) {
    await db.delete(oauthTokens).where(inArray(oauthTokens.clientId, clientIds));
    await db.delete(oauthCodes).where(inArray(oauthCodes.clientId, clientIds));
    await db.delete(oauthClients).where(and(inArray(oauthClients.clientId, clientIds)));
  }
  console.log("(klien uji dihapus)");
  process.exit(process.exitCode ?? 0);
}
