/**
 * Studio MCP over Streamable HTTP (stateless), shared by the shared URL /api/mcp and the
 * per-agent URLs /api/mcp/<slug>. Two ways in, both `Authorization: Bearer`:
 * - OAuth 2.1 access tokens (Claude.ai / Claude Code routines, Grok), bound to one agent at
 *   consent and to the exact URL they were issued for (RFC 8707 audience);
 * - static agent tokens (clients that let you set headers: Claude Code CLI, xAI API).
 * On a per-agent URL the token must belong to that agent. The agent decides which tools exist.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStudioServer } from "@/lib/mcp/server";
import { mcpResourceUrl, roleForSlug, type AgentSlug } from "@/lib/oauth/core";
import { CORS, publicOrigin } from "@/lib/oauth/http";
import { agentForAccessToken } from "@/lib/oauth/service";
import { authenticate, recordAgentRequest } from "@/lib/studio/service";

function unauthorized(origin: string, slug: AgentSlug | null, message: string, invalidToken: boolean): Response {
  // RFC 9728: point the client at the metadata of this exact URL so it can start the sign-in flow.
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp${slug ? `/${slug}` : ""}`;
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    {
      status: 401,
      headers: {
        ...CORS,
        "Access-Control-Expose-Headers": "WWW-Authenticate",
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}"${invalidToken ? ', error="invalid_token"' : ""}`,
      },
    },
  );
}

export async function handleMcp(request: Request, slug: AgentSlug | null): Promise<Response> {
  const origin = publicOrigin(request.headers, request.url);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return unauthorized(origin, slug, "Unauthorized: butuh login OAuth", false);

  const agent = token.startsWith("rsat_")
    ? await agentForAccessToken(token, mcpResourceUrl(origin, slug))
    : await authenticate(token);
  if (!agent) return unauthorized(origin, slug, "Unauthorized: token tidak valid atau kedaluwarsa", true);
  if (slug && agent.role !== roleForSlug(slug)) {
    return unauthorized(origin, slug, `Unauthorized: token ini milik ${agent.name}, bukan agen untuk URL /api/mcp/${slug}`, true);
  }

  // Heartbeat + which tool was called (for the Agents page and the health tick). Never blocks the call.
  if (request.method === "POST") {
    const tool = await request
      .clone()
      .json()
      .then((b: { method?: string; params?: { name?: string } }) => (b?.method === "tools/call" ? (b.params?.name ?? null) : null))
      .catch(() => null);
    await recordAgentRequest(agent.id, tool).catch((e) => console.error("[mcp] activity log failed", e));
  }

  const server = createStudioServer(agent);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Stateless: one server per request. Close after the response body is produced.
    void transport.close();
    void server.close();
  }
}

export function mcpPreflight() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id" } });
}
