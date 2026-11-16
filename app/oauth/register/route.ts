import { validateRegistration } from "@/lib/oauth/core";
import { json, oauthError, preflight } from "@/lib/oauth/http";
import { registerClient } from "@/lib/oauth/service";

/**
 * RFC 7591 dynamic client registration. Open by design (AI apps register themselves); a client
 * can do nothing until the operator signs in and approves it on the consent screen.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const v = validateRegistration(body);
  if (!v.ok) return json({ error: "invalid_client_metadata", error_description: v.error }, 400);
  try {
    const c = await registerClient(v.value);
    return json(
      {
        client_id: c.clientId,
        ...(c.clientSecret ? { client_secret: c.clientSecret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: c.name,
        redirect_uris: c.redirectUris,
        token_endpoint_auth_method: c.tokenEndpointAuthMethod,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  } catch (e) {
    return oauthError(e);
  }
}

export const OPTIONS = preflight;
