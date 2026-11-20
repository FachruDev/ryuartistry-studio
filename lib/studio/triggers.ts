/**
 * Pure pieces of agent triggers: Standard Webhooks signing (what Grok Automations verify) and
 * picking which scheduled run is due. Unit-tested; the service does the I/O.
 */
import { createHmac } from "node:crypto";

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sorted, unique "HH:MM" list; throws on anything else. */
export function parseTimes(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const bad = parts.filter((t) => !TIME_RE.test(t));
  if (bad.length) throw new Error(`Jam tidak valid: ${bad.join(", ")} (pakai format HH:MM, mis. 06:30)`);
  if (!parts.length) throw new Error("Isi minimal satu jam jalan");
  if (parts.length > 24) throw new Error("Maksimal 24 jam jalan per hari");
  return [...new Set(parts)].sort();
}

/** "HH:MM" of `now` in studio time (Asia/Jakarta). */
export function studioClock(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/**
 * The latest run time that has already passed today, if it passed within `graceMinutes`
 * (so a scheduler that was down for hours does not fire a stale morning run in the evening).
 */
export function dueRunTime(times: string[], clock: string, graceMinutes = 180): string | null {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const now = mins(clock);
  const passed = times.filter((t) => mins(t) <= now);
  const last = passed.at(-1);
  return last && now - mins(last) <= graceMinutes ? last : null;
}

/**
 * Standard Webhooks signature: base64(HMAC-SHA256(secret, "<id>.<timestamp>.<body>")).
 * Secrets in the "whsec_<base64>" form are base64-decoded first; anything else is used as raw bytes.
 */
export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export function webhookHeaders(secret: string | null, id: string, body: string, now = new Date()): Record<string, string> {
  const ts = Math.floor(now.getTime() / 1000);
  return {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    ...(secret ? { "webhook-signature": signWebhook(secret, id, ts, body) } : {}),
  };
}

/** Only https (or localhost for testing) endpoints may be called. */
export function isValidTriggerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}
