import { expect, test } from "bun:test";
import { hashPassword, passwordProblems, verifyPassword } from "./password";

test("hash round-trips, is salted, and rejects wrong passwords", async () => {
  const a = await hashPassword("correct horse battery");
  const b = await hashPassword("correct horse battery");
  expect(a).not.toBe(b);
  expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
  expect(await verifyPassword("correct horse battery", a)).toBe(true);
  expect(await verifyPassword("correct horse batterY", a)).toBe(false);
  expect(await verifyPassword("x", "not-a-hash")).toBe(false);
});

test("new password rules", () => {
  expect(passwordProblems("password", "ryuqing")).toEqual(["minimal 10 karakter", "terlalu umum"]);
  expect(passwordProblems("ryuqing-2026!", "ryuqing")).toEqual(["tidak boleh mengandung nama pengguna"]);
  expect(passwordProblems("aaaaaaaaaaaa", "x")).toEqual(["terlalu sedikit variasi karakter"]);
  expect(passwordProblems("Kopi-Senja-42", "ryuqing")).toEqual([]);
});
