import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function getSession() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For server actions and route handlers; the proxy is only an optimistic first check. */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Sesi berakhir. Masuk lagi untuk melanjutkan.");
  return session;
}
