import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { getUserById } from "./users";

/**
 * Signed cookie AND a live account: the user must still exist, be active, and carry the same
 * session version (a password change bumps it, signing out every older session).
 */
export async function getSession() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await getUserById(session.uid);
  if (!user || !user.active || user.sessionVersion !== session.v) return null;
  return { ...session, user: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
}

/** For server actions and route handlers; the proxy is only an optimistic first check. */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Sesi berakhir. Masuk lagi untuk melanjutkan.");
  return session;
}
