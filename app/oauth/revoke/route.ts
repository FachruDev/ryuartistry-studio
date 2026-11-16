import { basicAuth, json, oauthError, preflight, readParams } from "@/lib/oauth/http";
import { OAuthError, authenticateClient, resolveClient, revokeToken } from "@/lib/oauth/service";

/** RFC 7009 token revocation. Responds 200 even for unknown tokens, as the spec requires. */
export async function POST(request: Request) {
  try {
    const p = await readParams(request);
    const basic = basicAuth(request);
    const clientId = basic?.id ?? p.client_id;
    if (!clientId) throw new OAuthError("invalid_client", "client_id is required", 401);
    const client = await resolveClient(clientId);
    authenticateClient(client, basic?.secret ?? p.client_secret ?? null);
    if (p.token) await revokeToken(p.token, client.clientId);
    return json({});
  } catch (e) {
    return oauthError(e);
  }
}

export const OPTIONS = preflight;
