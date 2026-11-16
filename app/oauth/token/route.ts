import { basicAuth, json, oauthError, preflight, readParams } from "@/lib/oauth/http";
import { OAuthError, authenticateClient, exchangeCode, refreshTokens, resolveClient } from "@/lib/oauth/service";

/** Token endpoint: authorization_code (with PKCE) and refresh_token (rotating) grants. */
export async function POST(request: Request) {
  try {
    const p = await readParams(request);
    const basic = basicAuth(request);
    const clientId = basic?.id ?? p.client_id;
    if (!clientId) throw new OAuthError("invalid_client", "client_id is required", 401);
    const client = await resolveClient(clientId);
    authenticateClient(client, basic?.secret ?? p.client_secret ?? null);

    if (p.grant_type === "authorization_code") {
      if (!p.code || !p.redirect_uri || !p.code_verifier) throw new OAuthError("invalid_request", "code, redirect_uri and code_verifier are required");
      return json(await exchangeCode({ client, code: p.code, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier }));
    }
    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token) throw new OAuthError("invalid_request", "refresh_token is required");
      return json(await refreshTokens({ client, refreshToken: p.refresh_token }));
    }
    throw new OAuthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
  } catch (e) {
    return oauthError(e);
  }
}

export const OPTIONS = preflight;
