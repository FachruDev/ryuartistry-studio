import { afterAll, beforeAll, expect, test } from "bun:test";
import { authConfigProblems, createSessionToken, envValue, safeNext, verifySessionToken } from "./session";

const env = { ...process.env };
const user = { id: "00000000-0000-0000-0000-000000000001", username: "ryuqing", sessionVersion: 3 };
beforeAll(() => {
  process.env.STUDIO_SESSION_SECRET = "x".repeat(40);
});
afterAll(() => {
  process.env = env;
});

test("tokens carry user id and session version, expire, and reject tampering", () => {
  const t = createSessionToken(user, 0);
  expect(verifySessionToken(t, 1000)).toMatchObject({ uid: user.id, user: "ryuqing", v: 3 });
  expect(verifySessionToken(t, 8 * 24 * 3600 * 1000)).toBeNull();
  const [payload, mac] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: user.id, user: "x", v: 3, exp: 9e9 })).toString("base64url");
  expect(verifySessionToken(`${forged}.${mac}`, 1000)).toBeNull();
  expect(verifySessionToken(`${payload}.x${mac.slice(1)}`, 1000)).toBeNull();
  expect(verifySessionToken(undefined)).toBeNull();
});

test("open-redirect guard", () => {
  expect(safeNext("/dashboard/reels")).toBe("/dashboard/reels");
  expect(safeNext("/dashboard/research?platform=facebook_reels")).toBe("/dashboard/research?platform=facebook_reels");
  expect(safeNext("https://evil.example/dashboard")).toBe("/dashboard");
  expect(safeNext("//evil.example")).toBe("/dashboard");
});

test("login may return to the OAuth consent page, but nowhere external", () => {
  const consent = "/oauth/authorize?response_type=code&client_id=rsc_abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=x";
  expect(safeNext(consent)).toBe(consent);
  expect(safeNext("/oauth/authorize")).toBe("/dashboard");
  expect(safeNext("/oauth/token?x=1")).toBe("/dashboard");
  expect(safeNext("/oauth/authorize?<script>")).toBe("/dashboard");
  expect(safeNext("//evil.example/oauth/authorize?a=b")).toBe("/dashboard");
});

test("env values pasted with quotes or spaces are cleaned; missing secret is reported", () => {
  process.env.SOME_VALUE = '  "abc"\n';
  expect(envValue("SOME_VALUE")).toBe("abc");
  expect(authConfigProblems()).toEqual([]);
  process.env.STUDIO_SESSION_SECRET = "short";
  expect(authConfigProblems()).toEqual(["STUDIO_SESSION_SECRET belum diatur atau kurang dari 32 karakter"]);
});
