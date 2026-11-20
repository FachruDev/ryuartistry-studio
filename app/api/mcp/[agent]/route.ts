import { handleMcp, mcpPreflight } from "@/lib/mcp/http";
import { roleForSlug, type AgentSlug } from "@/lib/oauth/core";

/**
 * One MCP URL per agent (/api/mcp/lukas, /api/mcp/rina-scout, ...). Chat apps allow only one
 * connector per URL, so this is how one app holds several agents. The URL fixes the agent.
 */
async function handle(request: Request, ctx: RouteContext<"/api/mcp/[agent]">): Promise<Response> {
  const { agent } = await ctx.params;
  if (!roleForSlug(agent)) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32601, message: `Agen tidak dikenal: ${agent}` }, id: null }, { status: 404 });
  }
  return handleMcp(request, agent as AgentSlug);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = mcpPreflight;
