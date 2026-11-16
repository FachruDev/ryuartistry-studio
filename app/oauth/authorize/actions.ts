"use server";

import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { checkAuthorizeRequest, errorRedirect, type AuthorizeParams } from "@/lib/oauth/authorize";
import { publicOrigin } from "@/lib/oauth/http";
import { createAuthorizationCode } from "@/lib/oauth/service";

const FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

/** Approve or deny. Everything is re-validated here; nothing from the form is trusted as-is. */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = Object.fromEntries(FIELDS.map((f) => [f, (formData.get(f) as string | null) || undefined])) as AuthorizeParams;
  const origin = publicOrigin(await headers());
  const check = await checkAuthorizeRequest(params, origin);
  if (check.kind === "fatal") throw new Error(check.message);
  if (check.kind === "redirect-error") redirect(check.url);

  if (formData.get("decision") !== "approve") {
    redirect(errorRedirect(check.redirectUri, "access_denied", "The operator denied access", check.state));
  }

  const agentId = String(formData.get("agentId") ?? "");
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.active, true), ne(agents.role, "admin")));
  if (!agent) throw new Error("Pilih agen yang akan diwakili aplikasi ini.");

  const code = await createAuthorizationCode({
    clientId: check.client.clientId,
    userId: session.uid,
    agentId: agent.id,
    redirectUri: check.redirectUri,
    codeChallenge: check.codeChallenge,
    resource: check.resource,
  });
  const back = new URL(check.redirectUri);
  back.searchParams.set("code", code);
  if (check.state) back.searchParams.set("state", check.state);
  back.searchParams.set("iss", origin);
  redirect(back.toString());
}
