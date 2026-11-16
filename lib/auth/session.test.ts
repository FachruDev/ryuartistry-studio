import { afterAll, beforeAll, expect, test } from "bun:test";
import { authConfigProblems, checkCredentials, clearFailures, createSessionToken, lockedFor, recordFailure, safeNext, verifySessionToken } from "./session";

const env = { ...process.env };
beforeAll(() => {
  process.env.STUDIO_SESSION_SECRET = "x".repeat(40);
  process.env.STUDIO_DASHBOARD_USER = "admin";
  process.env.STUDIO_DASHBOARD_PASSWORD = "correct horse";
});
afterAll(() => {
  process.env = env;
});

test("tokens round-trip, expire, and reject tampering", () => {
  const t = createSessionToken("admin", 0);
  expect(verifySessionToken(t, 1000)?.user).toBe("admin");
  expect(verifySessionToken(t, 8 * 24 * 3600 * 1000)).toBeNull();
  const [payload, mac] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ user: "admin", exp: 9e9 })).toString("base64url");
  expect(verifySessionToken(`${forged}.${mac}`, 1000)).toBeNull();
  expect(verifySessionToken(`${payload}.x${mac.slice(1)}`, 1000)).toBeNull();
  expect(verifySessionToken(undefined)).toBeNull();
});

test("credentials and open-redirect guard", () => {
  expect(checkCredentials("admin", "correct horse")).toBe(true);
  expect(checkCredentials("admin", "wrong")).toBe(false);
  expect(safeNext("/dashboard/reels")).toBe("/dashboard/reels");
  expect(safeNext("/dashboard/research?platform=facebook_reels")).toBe("/dashboard/research?platform=facebook_reels");
  expect(safeNext("https://evil.example/dashboard")).toBe("/dashboard");
  expect(safeNext("//evil.example")).toBe("/dashboard");
});

test("locks out after 5 failures for the window", () => {
  const key = "1.2.3.4";
  for (let i = 0; i < 5; i++) recordFailure(key, 0);
  expect(lockedFor(key, 1000)).toBeGreaterThan(0);
  expect(lockedFor(key, 16 * 60 * 1000)).toBe(0);
  clearFailures(key);
  expect(lockedFor(key, 1000)).toBe(0);
});

test("env values pasted with quotes or spaces still work, and missing config is reported", () => {
  process.env.STUDIO_DASHBOARD_PASSWORD = '  "correct horse"\n';
  expect(checkCredentials("admin", "correct horse")).toBe(true);
  expect(authConfigProblems()).toEqual([]);
  delete process.env.STUDIO_DASHBOARD_PASSWORD;
  process.env.STUDIO_SESSION_SECRET = "short";
  expect(authConfigProblems()).toEqual([
    "STUDIO_DASHBOARD_PASSWORD belum diatur",
    "STUDIO_SESSION_SECRET belum diatur atau kurang dari 32 karakter",
  ]);
});
