/** Session cookie for the first active superadmin, so smoke tests can open dashboard pages. */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";

export async function operatorCookie(): Promise<string> {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "superadmin"), eq(users.active, true)))
    .limit(1);
  if (!u) throw new Error("Belum ada akun superadmin. Buat dulu dengan scripts/create-user.ts");
  return `${SESSION_COOKIE}=${createSessionToken(u)}`;
}
