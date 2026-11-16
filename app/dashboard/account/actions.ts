"use server";

import { setSessionCookie } from "@/lib/auth/cookie";
import { requireSession } from "@/lib/auth/server";
import { changePassword } from "@/lib/auth/users";

export type PasswordState = { ok?: string; error?: string; field?: "current" | "next" | "confirm" } | null;

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await requireSession();
  const result = await changePassword(
    session.uid,
    String(formData.get("current") ?? ""),
    String(formData.get("next") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  // Other sessions are now invalid (version bumped); keep this one signed in with the new version.
  await setSessionCookie(result.user);
  return { ok: "Kata sandi diganti. Sesi di perangkat lain sudah dikeluarkan." };
}
