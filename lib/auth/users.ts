/**
 * Operator accounts stored in Postgres. Lockout state lives in the database so it holds across
 * serverless instances (Vercel), unlike an in-memory counter.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { hashPassword, passwordProblems, timingDummyHash, verifyPassword } from "./password";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type User = typeof users.$inferSelect;

const norm = (username: string) => username.trim().toLowerCase();

export async function findUser(username: string): Promise<User | null> {
  const [u] = await db.select().from(users).where(eq(users.username, norm(username)));
  return u ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutes: number };

export async function authenticateUser(username: string, password: string, now = new Date()): Promise<LoginResult> {
  const user = await findUser(username);
  if (!user || !user.active) {
    // Same work as a real check, so response time does not reveal which usernames exist.
    await verifyPassword(password, await timingDummyHash());
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked", minutes: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000) };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000) : user.lockedUntil })
      .where(eq(users.id, user.id));
    return lock ? { ok: false, reason: "locked", minutes: LOCK_MINUTES } : { ok: false, reason: "invalid" };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
  return { ok: true, user };
}

/** Creates (or, with `reset`, overwrites the password of) an account. */
export async function upsertUser(input: {
  username: string;
  password: string;
  role: "superadmin" | "operator";
  mustChangePassword: boolean;
  reset?: boolean;
}): Promise<{ user: User; created: boolean }> {
  const username = norm(input.username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Nama pengguna 3-32 karakter: huruf kecil, angka, titik, minus, garis bawah");
  const passwordHash = await hashPassword(input.password);
  const existing = await findUser(username);
  if (existing && !input.reset) return { user: existing, created: false };
  if (existing) {
    const [user] = await db
      .update(users)
      .set({
        passwordHash,
        role: input.role,
        mustChangePassword: input.mustChangePassword,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        failedLogins: 0,
        lockedUntil: null,
        active: true,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return { user, created: false };
  }
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role: input.role, mustChangePassword: input.mustChangePassword })
    .returning();
  return { user, created: true };
}

export type ChangePasswordResult = { ok: true; user: User } | { ok: false; field: "current" | "next" | "confirm"; error: string };

/** Verifies the current password, applies rules to the new one, and signs out other sessions. */
export async function changePassword(userId: string, current: string, next: string, confirm: string): Promise<ChangePasswordResult> {
  const user = await getUserById(userId);
  if (!user) return { ok: false, field: "current", error: "Akun tidak ditemukan. Masuk lagi." };
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, field: "current", error: "Kata sandi saat ini salah." };
  }
  const problems = passwordProblems(next, user.username);
  if (problems.length) return { ok: false, field: "next", error: `Kata sandi baru ${problems.join(", ")}.` };
  if (next === current) return { ok: false, field: "next", error: "Kata sandi baru harus berbeda dari yang lama." };
  if (next !== confirm) return { ok: false, field: "confirm", error: "Konfirmasi tidak sama dengan kata sandi baru." };

  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, user.id))
    .returning();
  return { ok: true, user: updated };
}
