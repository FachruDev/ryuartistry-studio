import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "./session";

/**
 * Sets the session cookie. Deliberately NOT in a "use server" file: exporting it there would
 * expose it as a callable server action that could mint a session for any user id.
 */
export async function setSessionCookie(user: { id: string; username: string; sessionVersion: number }) {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
