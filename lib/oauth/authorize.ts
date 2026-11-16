/** Validation of an /oauth/authorize request, shared by the consent page and its server action. */
import { mcpResourceUrl, resourceMatches } from "./core";
import { OAuthError, resolveClient, type OAuthClient } from "./service";

export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

export type AuthorizeCheck =
  /** Cannot trust redirect_uri: show the error on our own page. */
  | { kind: "fatal"; message: string }
  /** redirect_uri is trusted: send the error back to the client. */
  | { kind: "redirect-error"; url: string }
  | { kind: "ok"; client: OAuthClient; redirectUri: string; codeChallenge: string; state?: string; resource: string };

export function errorRedirect(redirectUri: string, error: string, description: string, state?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

export async function checkAuthorizeRequest(p: AuthorizeParams, origin: string): Promise<AuthorizeCheck> {
  if (!p.client_id) return { kind: "fatal", message: "Permintaan tidak menyertakan client_id." };
  let client: OAuthClient;
  try {
    client = await resolveClient(p.client_id);
  } catch (e) {
    return {
      kind: "fatal",
      message: e instanceof OAuthError ? `Data pendaftaran aplikasi tidak bisa dipakai (${e.message}).` : "Aplikasi tidak dikenal.",
    };
  }
  // Exact match only: an unregistered redirect could send the code to an attacker.
  if (!p.redirect_uri || !client.redirectUris.includes(p.redirect_uri)) {
    return { kind: "fatal", message: "Alamat kembali (redirect_uri) tidak terdaftar untuk aplikasi ini." };
  }
  const back = (error: string, d: string): AuthorizeCheck => ({ kind: "redirect-error", url: errorRedirect(p.redirect_uri!, error, d, p.state) });
  if (p.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported");
  if (!p.code_challenge || p.code_challenge_method !== "S256") return back("invalid_request", "PKCE with code_challenge_method=S256 is required");
  if (!resourceMatches(p.resource, origin)) return back("invalid_target", "resource must be this server's MCP endpoint");
  return {
    kind: "ok",
    client,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
    state: p.state,
    resource: mcpResourceUrl(origin),
  };
}
