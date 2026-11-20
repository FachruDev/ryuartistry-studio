import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { buildTriggerRequest, dueRunTime, isClaudeRoutineUrl, isValidTriggerUrl, parseTimes, signWebhook, studioClock, webhookHeaders } from "./triggers";

test("run times are parsed, sorted and validated", () => {
  expect(parseTimes("18:30, 06:30 12:30;06:30")).toEqual(["06:30", "12:30", "18:30"]);
  expect(() => parseTimes("6:30")).toThrow("HH:MM");
  expect(() => parseTimes("24:00")).toThrow();
  expect(() => parseTimes(" ")).toThrow("minimal satu");
});

test("the latest passed run time is due, within the grace window", () => {
  const times = ["06:30", "12:30", "18:30"];
  expect(dueRunTime(times, "06:29")).toBeNull();
  expect(dueRunTime(times, "06:30")).toBe("06:30");
  expect(dueRunTime(times, "13:05")).toBe("12:30");
  expect(dueRunTime(times, "16:00")).toBeNull(); // 12:30 is older than 3 hours
  expect(dueRunTime(times, "21:30")).toBe("18:30");
  expect(dueRunTime(times, "23:59")).toBeNull();
});

test("studio clock is Jakarta time", () => {
  expect(studioClock(new Date("2026-11-20T23:30:00Z"))).toBe("06:30");
});

test("Standard Webhooks signature", () => {
  const raw = Buffer.from("super-secret-key-bytes");
  const secret = `whsec_${raw.toString("base64")}`;
  const body = JSON.stringify({ a: 1 });
  const expected = createHmac("sha256", raw).update(`msg_1.1700000000.${body}`).digest("base64");
  expect(signWebhook(secret, "msg_1", 1700000000, body)).toBe(`v1,${expected}`);
  const h = webhookHeaders(secret, "msg_1", body, new Date(1700000000 * 1000));
  expect(h["webhook-timestamp"]).toBe("1700000000");
  expect(h["webhook-signature"]).toBe(`v1,${expected}`);
  expect(webhookHeaders(null, "msg_1", body)["webhook-signature"]).toBeUndefined();
});

test("trigger URLs must be https", () => {
  expect(isValidTriggerUrl("https://api.x.ai/hooks/abc")).toBe(true);
  expect(isValidTriggerUrl("http://localhost:3000/x")).toBe(true);
  expect(isValidTriggerUrl("http://example.com/x")).toBe(false);
  expect(isValidTriggerUrl("nope")).toBe(false);
});

test("Claude Code routine URLs get a bearer token and a text body", () => {
  const url = "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire";
  expect(isClaudeRoutineUrl(url)).toBe(true);
  expect(isClaudeRoutineUrl("https://api.anthropic.com/v1/messages")).toBe(false);
  expect(isClaudeRoutineUrl("https://grok.com/webhook/automation/x")).toBe(false);

  const r = buildTriggerRequest(url, "sk-ant-oat01-test", "msg_1", { due: [1] });
  expect(r.kind).toBe("claude_routine");
  expect(r.headers.Authorization).toBe("Bearer sk-ant-oat01-test");
  expect(r.headers["anthropic-version"]).toBe("2023-06-01");
  expect(JSON.parse(JSON.parse(r.body).text)).toEqual({ due: [1] });
  expect(() => buildTriggerRequest(url, null, "msg_1", {})).toThrow("token");

  const w = buildTriggerRequest("https://grok.com/webhook/automation/x", "whsec_c2VjcmV0", "msg_1", { a: 1 });
  expect(w.kind).toBe("webhook");
  expect(w.headers["webhook-signature"]).toStartWith("v1,");
  expect(JSON.parse(w.body)).toEqual({ a: 1 });
});
