/**
 * Password hashing with Node's built-in scrypt (memory-hard, no native dependency, works on
 * Vercel). Format: scrypt$N$r$p$<salt base64>$<hash base64>, so parameters can be raised later
 * without breaking existing hashes.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A precomputed hash of a random value, so unknown usernames cost the same time as wrong passwords. */
let dummyHash: Promise<string> | null = null;
export function timingDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

/** Rules for a new password. Returns problems in Indonesian, empty when acceptable. */
export function passwordProblems(password: string, username: string): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("minimal 10 karakter");
  if (password.length > 200) problems.push("maksimal 200 karakter");
  const lower = password.toLowerCase();
  if (["password", "password123", "1234567890", "qwertyuiop", "admin12345"].includes(lower)) problems.push("terlalu umum");
  if (username && lower.includes(username.toLowerCase())) problems.push("tidak boleh mengandung nama pengguna");
  if (new Set(password).size < 5) problems.push("terlalu sedikit variasi karakter");
  return problems;
}
