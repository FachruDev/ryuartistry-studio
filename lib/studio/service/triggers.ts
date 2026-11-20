/**
 * Agent triggers: at each run time set for an agent, the cron tick POSTs a signed webhook that
 * wakes the agent (e.g. a Grok Automation with a webhook trigger). A run is sent only when the
 * agent actually has work, and each run time fires at most once (unique run key).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { envValue } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { agents, jobs, type AgentRole } from "@/lib/db/schema";
import { agentTriggerRuns, agentTriggers } from "@/lib/db/schema-triggers";
import { mcpResourceUrl, slugForRole } from "@/lib/oauth/core";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { ROLE_QUEUES, type PipelineRole } from "../config";
import { studioToday } from "../research-periods";
import { buildTriggerRequest, dueRunTime, isValidTriggerUrl, parseTimes, studioClock } from "../triggers";
import { StudioError } from "./core";
import { getResearchSchedule } from "./research-insights";

export type TriggerRole = Exclude<AgentRole, "admin">;
const PLATFORMS = ["adobe_stock", "facebook_reels"] as const;

/** What the agent would find to do right now; empty = nothing to wake it for. */
export async function workDue(role: TriggerRole, now = new Date()): Promise<unknown[]> {
  if (role === "rina" || role === "rina_scout") {
    const all = await Promise.all(PLATFORMS.map((p) => getResearchSchedule(p, now, role)));
    return all.flatMap((s) => s.due.map((d) => ({ platform: s.platform, ...d })));
  }
  const rows = await db
    .select({ platform: jobs.platform, status: jobs.status, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(inArray(jobs.status, ROLE_QUEUES[role as PipelineRole]), or(isNull(jobs.claimedUntil), lt(jobs.claimedUntil, now))))
    .groupBy(jobs.platform, jobs.status);
  return rows.map((r) => ({ action: "queue", platform: r.platform, status: r.status, jobs: r.n }));
}

async function agentName(role: TriggerRole) {
  const [a] = await db.select({ name: agents.name }).from(agents).where(eq(agents.role, role)).limit(1);
  return a?.name ?? role;
}

type Trigger = typeof agentTriggers.$inferSelect;

async function send(t: Trigger, runKey: string, scheduledFor: string | null, due: unknown[], now: Date) {
  // Claim the run key first: concurrent ticks cannot both send the same run.
  const [run] = await db
    .insert(agentTriggerRuns)
    .values({ role: t.role, runKey, status: "sent", detail: "mengirim…", due })
    .onConflictDoNothing({ target: agentTriggerRuns.runKey })
    .returning({ id: agentTriggerRuns.id });
  if (!run) return null;

  const origin = envValue("STUDIO_PUBLIC_URL")?.replace(/\/+$/, "") ?? null;
  const slug = slugForRole(t.role);
  const payload = {
    type: "studio.agent_run",
    agent: { role: t.role, name: await agentName(t.role as TriggerRole) },
    run: runKey,
    day: studioToday(now),
    scheduledFor: scheduledFor ? `${scheduledFor} WIB` : null,
    mcpUrl: origin && slug ? mcpResourceUrl(origin, slug) : null,
    instruction: "Jalankan satu shift sekarang: panggil get_playbook lalu kerjakan semua yang ada di daftar due. Akhiri dengan ringkasan singkat.",
    due,
  };
  let status: "sent" | "failed" = "failed";
  let httpStatus: number | null = null;
  let detail = "";
  try {
    const secret = t.secretEnc ? openSecret(t.secretEnc) : null;
    const req = buildTriggerRequest(t.url, secret, `msg_${run.id}`, payload, now);
    const res = await fetch(t.url, { method: "POST", headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
    httpStatus = res.status;
    status = res.ok ? "sent" : "failed";
    const text = await res.text().catch(() => "");
    // Claude routines answer with the new session's URL; keep it so the run can be opened.
    const session = res.ok && req.kind === "claude_routine" ? (JSON.parse(text || "{}") as { claude_code_session_url?: string }).claude_code_session_url : null;
    detail = res.ok ? `Diterima (${res.status})${session ? ` · ${session}` : ""}` : `Ditolak ${res.status}: ${text.slice(0, 300)}`;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  await db.update(agentTriggerRuns).set({ status, httpStatus, detail }).where(eq(agentTriggerRuns.id, run.id));
  return { role: t.role, runKey, status, httpStatus, detail };
}

/** Called by the cron tick. Run it every 15-30 minutes; each run time fires once. */
export async function dispatchTriggers(now = new Date()) {
  const day = studioToday(now);
  const clock = studioClock(now);
  const out: { role: string; runKey: string; status: string; httpStatus?: number | null; detail?: string }[] = [];
  for (const t of await db.select().from(agentTriggers).where(eq(agentTriggers.enabled, true))) {
    const at = dueRunTime(t.times, clock);
    if (!at) continue;
    const runKey = `${t.role}:${day}:${at}`;
    const [done] = await db.select({ id: agentTriggerRuns.id }).from(agentTriggerRuns).where(eq(agentTriggerRuns.runKey, runKey));
    if (done) continue;
    const due = await workDue(t.role as TriggerRole, now);
    if (!due.length) {
      const [skip] = await db
        .insert(agentTriggerRuns)
        .values({ role: t.role, runKey, status: "skipped", detail: "Tidak ada pekerjaan; agen tidak dibangunkan" })
        .onConflictDoNothing({ target: agentTriggerRuns.runKey })
        .returning({ id: agentTriggerRuns.id });
      if (skip) out.push({ role: t.role, runKey, status: "skipped" });
      continue;
    }
    const r = await send(t, runKey, at, due, now);
    if (r) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Operator actions (Agents page)
// ---------------------------------------------------------------------------

export async function triggersOverview() {
  const triggers = await db.select().from(agentTriggers);
  const runs = await db.select().from(agentTriggerRuns).orderBy(desc(agentTriggerRuns.createdAt)).limit(120);
  return triggers.map(({ secretEnc, ...t }) => ({
    ...t,
    hasSecret: Boolean(secretEnc),
    runs: runs.filter((r) => r.role === t.role).slice(0, 6),
  }));
}

export async function saveTrigger(role: TriggerRole, input: { url: string; secret: string; times: string; enabled: boolean; clearSecret?: boolean }) {
  const url = input.url.trim();
  if (!isValidTriggerUrl(url)) throw new StudioError("URL webhook harus https://");
  let times: string[];
  try {
    times = parseTimes(input.times);
  } catch (e) {
    throw new StudioError(e instanceof Error ? e.message : String(e));
  }
  const secret = input.secret.trim();
  const secretEnc = secret ? sealSecret(secret) : undefined;
  await db
    .insert(agentTriggers)
    .values({ role, url, times, enabled: input.enabled, secretEnc: secretEnc ?? null })
    .onConflictDoUpdate({
      target: agentTriggers.role,
      set: {
        url,
        times,
        enabled: input.enabled,
        updatedAt: new Date(),
        // Empty field keeps the stored secret, unless the operator asked to remove it.
        ...(secretEnc ? { secretEnc } : input.clearSecret ? { secretEnc: null } : {}),
      },
    });
}

export async function deleteTrigger(role: TriggerRole) {
  await db.delete(agentTriggers).where(eq(agentTriggers.role, role));
}

/** Sends one run right now, regardless of schedule, so the operator can check the connection. */
export async function testTrigger(role: TriggerRole, now = new Date()) {
  const [t] = await db.select().from(agentTriggers).where(eq(agentTriggers.role, role));
  if (!t) throw new StudioError("Pemicu belum disimpan");
  const r = await send(t, `${role}:test:${randomUUID()}`, null, await workDue(role, now), now);
  if (!r) throw new StudioError("Gagal mencatat uji pemicu");
  return r;
}
