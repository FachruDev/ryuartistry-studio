/**
 * Smoke test for database-backed accounts, using a temporary user that is deleted afterwards.
 *
 *   bun --env-file=.env --env-file=.env.local scripts/smoke-auth.ts [baseUrl]
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { MAX_FAILED_LOGINS, authenticateUser, changePassword, upsertUser } from "@/lib/auth/users";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const NAME = "smoke-auth-temp";
const step = (m: string) => console.log(`✓ ${m}`);
function expect(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function run() {
  const { user } = await upsertUser({ username: NAME, password: "Awal-Sekali-7", role: "operator", mustChangePassword: true, reset: true });
  const stored = (await db.select().from(users).where(eq(users.id, user.id)))[0];
  expect(stored.passwordHash.startsWith("scrypt$") && !stored.passwordHash.includes("Awal-Sekali-7"), "password must be hashed");
  step("akun tersimpan dengan hash scrypt, bukan teks asli");

  expect((await authenticateUser("SMOKE-AUTH-TEMP", "Awal-Sekali-7")).ok, "case-insensitive username login");
  expect(!(await authenticateUser(NAME, "salah")).ok, "wrong password");
  expect(!(await authenticateUser("tidak-ada", "x")).ok, "unknown user");
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await authenticateUser(NAME, "salah");
  const locked = await authenticateUser(NAME, "Awal-Sekali-7");
  expect(!locked.ok && locked.reason === "locked", `lockout: ${JSON.stringify(locked)}`);
  await db.update(users).set({ lockedUntil: null, failedLogins: 0 }).where(eq(users.id, user.id));
  step(`login: nama pengguna tidak peka huruf besar, ${MAX_FAILED_LOGINS} kali salah mengunci akun (di database)`);

  const oldCookie = `${SESSION_COOKIE}=${createSessionToken(stored)}`;
  const before = await (await fetch(new URL("/dashboard/account", base), { headers: { Cookie: oldCookie } })).text();
  expect(before.includes("kata sandi awal"), "must-change banner shown");

  const weak = await changePassword(user.id, "Awal-Sekali-7", "password", "password");
  expect(!weak.ok && weak.field === "next", "weak password rejected");
  const wrong = await changePassword(user.id, "keliru", "Kopi-Senja-42", "Kopi-Senja-42");
  expect(!wrong.ok && wrong.field === "current", "wrong current password rejected");
  const changed = await changePassword(user.id, "Awal-Sekali-7", "Kopi-Senja-42", "Kopi-Senja-42");
  expect(changed.ok && !changed.user.mustChangePassword, "password changed");
  expect((await authenticateUser(NAME, "Kopi-Senja-42")).ok && !(await authenticateUser(NAME, "Awal-Sekali-7")).ok, "new password works, old does not");

  const after = await fetch(new URL("/dashboard/account", base), { redirect: "manual", headers: { Cookie: oldCookie } });
  expect(after.status === 307 && after.headers.get("location")?.includes("/login"), `old session must be signed out before rendering, got ${after.status}`);
  step("ganti kata sandi: sandi lemah dan sandi lama yang salah ditolak; sesi lama otomatis keluar");

  console.log("\nAUTH SMOKE TEST PASSED");
}

try {
  await run();
} catch (e) {
  console.error("\nAUTH SMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.delete(users).where(eq(users.username, NAME));
  console.log("(akun uji dihapus)");
  process.exit(process.exitCode ?? 0);
}
