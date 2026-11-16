import { protectedResourceMetadata } from "@/lib/oauth/core";
import { json, preflight, publicOrigin } from "@/lib/oauth/http";

/** RFC 9728. Served at the root and at /.well-known/oauth-protected-resource/api/mcp. */
export async function GET(request: Request) {
  return json(protectedResourceMetadata(publicOrigin(request.headers, request.url)));
}

export const OPTIONS = preflight;
