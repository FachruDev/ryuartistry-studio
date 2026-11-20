import { protectedResourceMetadata, roleForSlug, type AgentSlug } from "@/lib/oauth/core";
import { json, preflight, publicOrigin } from "@/lib/oauth/http";

/**
 * RFC 9728. Served at the root, at /.well-known/oauth-protected-resource/api/mcp, and per agent
 * at /.well-known/oauth-protected-resource/api/mcp/<slug> (the resource is then that agent's URL).
 */
export async function GET(request: Request, ctx: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  const { path = [] } = await ctx.params;
  const slug = path.length === 3 && path[0] === "api" && path[1] === "mcp" ? path[2] : null;
  if (slug && !roleForSlug(slug)) return json({ error: "not_found" }, 404);
  return json(protectedResourceMetadata(publicOrigin(request.headers, request.url), slug as AgentSlug | null));
}

export const OPTIONS = preflight;
