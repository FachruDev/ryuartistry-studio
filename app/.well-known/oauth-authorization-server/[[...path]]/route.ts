import { authorizationServerMetadata } from "@/lib/oauth/core";
import { json, preflight, publicOrigin } from "@/lib/oauth/http";

/** RFC 8414 authorization server metadata. */
export async function GET(request: Request) {
  return json(authorizationServerMetadata(publicOrigin(request.headers, request.url)));
}

export const OPTIONS = preflight;
