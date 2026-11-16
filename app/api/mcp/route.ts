import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStudioServer } from "@/lib/mcp/server";
import { authenticate, recordAgentRequest } from "@/lib/studio/service";

/**
 * Studio MCP endpoint (Streamable HTTP, stateless).
 * Each agent authenticates with `Authorization: Bearer <token>`; the token decides the role
 * and therefore which tools are exposed.
 */
async function handle(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const agent = token ? await authenticate(token) : null;
  if (!agent) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: token agen tidak valid" }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="ryuartistry-studio"' } },
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
