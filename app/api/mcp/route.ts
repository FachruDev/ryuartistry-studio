import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStudioServer } from "@/lib/mcp/server";
import { mcpResourceUrl } from "@/lib/oauth/core";
import { CORS, publicOrigin } from "@/lib/oauth/http";
import { agentForAccessToken } from "@/lib/oauth/service";
import { authenticate, recordAgentRequest } from "@/lib/studio/service";

/**
 * Studio MCP endpoint (Streamable HTTP, stateless). Two ways in, both `Authorization: Bearer`:
 * - OAuth 2.1 access tokens (Claude.ai, ChatGPT, Gemini, Grok apps), bound to one agent at consent;
 * - static agent tokens (clients that let you set headers: Claude Code, Gemini CLI, xAI API).
 * The agent decides which tools are exposed.
 */
async function handle(request: Request): Promise<Response> {
  const origin = publicOrigin(request.headers, request.url);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const agent = !token
    ? null
    : token.startsWith("rsat_")
      ? await agentForAccessToken(token, mcpResourceUrl(origin))
      : await authenticate(token);
  if (!agent) {
    // RFC 9728: point the client at our OAuth metadata so it can start the sign-in flow.
    const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: token ? "Unauthorized: token tidak valid atau kedaluwarsa" : "Unauthorized: butuh login OAuth" }, id: null },
      {
        status: 401,
        headers: {
          ...CORS,
          "Access-Control-Expose-Headers": "WWW-Authenticate",
          "WWW-Authenticate": `Bearer resource_metadata="${metadata}"${token ? ', error="invalid_token"' : ""}`,
        },
      },
    );
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

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id" } });
}
