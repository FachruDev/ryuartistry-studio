"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfigProblems,
  checkCredentials,
  clearFailures,
  createSessionToken,
  lockedFor,
  recordFailure,
  safeNext,
} from "@/lib/auth/session";

export type LoginState = { error: string; field?: "username" | "password"; username?: string } | null;

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username) return { error: "Isi nama pengguna.", field: "username" };
  if (!password) return { error: "Isi kata sandi.", field: "password", username };

  // A missing server setting must not look like a wrong password.
  const problems = authConfigProblems();
  if (problems.length) {
    return {
      error: `Server belum dikonfigurasi: ${problems.join("; ")}. Isi di Environment Variables hosting (Vercel: Settings → Environment Variables), lalu redeploy.`,
      username,
    };
  }

  const key = await clientKey();
  const wait = lockedFor(key);
  if (wait) {
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, username };
  }
  if (!checkCredentials(username, password)) {
    recordFailure(key);
    return { error: "Nama pengguna atau kata sandi salah. Periksa lalu coba lagi.", field: "password", username };
  }
  clearFailures(key);

  let token: string;
  try {
    token = createSessionToken(username);
  } catch {
    return { error: "Server belum siap: STUDIO_SESSION_SECRET belum diatur. Isi di Environment Variables hosting lalu redeploy." };
  }
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
