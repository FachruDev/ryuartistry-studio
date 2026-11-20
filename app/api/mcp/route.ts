import { handleMcp, mcpPreflight } from "@/lib/mcp/http";

/** Shared MCP URL: the operator picks the agent at OAuth consent. Per-agent URLs: ./[agent]. */
const handle = (request: Request) => handleMcp(request, null);

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = mcpPreflight;
