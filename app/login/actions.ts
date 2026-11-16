"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setSessionCookie } from "@/lib/auth/cookie";
import { SESSION_COOKIE, authConfigProblems, safeNext } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/auth/users";

export type LoginState = { error: string; field?: "username" | "password"; username?: string } | null;

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

  const result = await authenticateUser(username, password);
  if (!result.ok) {
    return result.reason === "locked"
      ? { error: `Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi dalam ${result.minutes} menit.`, username }
      : { error: "Nama pengguna atau kata sandi salah. Periksa lalu coba lagi.", field: "password", username };
  }

  await setSessionCookie(result.user);
  redirect(result.user.mustChangePassword ? "/dashboard/account" : safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
