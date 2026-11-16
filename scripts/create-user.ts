/**
 * Creates a dashboard account (password stored as a scrypt hash in the database).
 *
 *   bun --env-file=.env scripts/create-user.ts --username ryuqing --password '…' [--role superadmin|operator] [--must-change] [--reset]
 *
 * --must-change  ask the user to change the password at first login
 * --reset        overwrite the password of an existing account and sign out its sessions
 *
 * The password is read from the command line only; it is never written to a file.
 */
import { upsertUser } from "@/lib/auth/users";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const username = arg("username");
const password = arg("password");
const role = arg("role") === "operator" ? "operator" : "superadmin";
if (!username || !password) {
  console.error("Pakai: scripts/create-user.ts --username <nama> --password <sandi> [--role superadmin|operator] [--must-change] [--reset]");
  process.exit(1);
}

try {
  const { user, created } = await upsertUser({
    username,
    password,
    role,
    mustChangePassword: process.argv.includes("--must-change"),
    reset: process.argv.includes("--reset"),
  });
  console.log(
    created
      ? `Akun ${user.username} (${user.role}) dibuat.`
      : process.argv.includes("--reset")
        ? `Kata sandi ${user.username} direset; sesi lamanya keluar.`
        : `Akun ${user.username} sudah ada; tidak diubah (pakai --reset untuk mengganti kata sandi).`,
  );
  if (user.mustChangePassword) console.log("Diminta mengganti kata sandi saat login pertama.");
  process.exit(0);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
