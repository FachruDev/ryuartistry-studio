/**
 * Phase 4: settings, agent heartbeats, budgets, notifications, and the periodic health tick.
 */
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, cycles, jobs, publications, usageCosts, type Platform } from "@/lib/db/schema";
import { agentActivity, notifications, settings } from "@/lib/db/schema-automation";
import {
  agentHealth,
  automationSettingsSchema,
  dailyBudgetState,
  parseSettings,
  stalledJobs,
  type AutomationSettings,
} from "../automation";
import { ROLE_QUEUES } from "../config";
import { studioToday } from "../research-periods";
import { randomBytes } from "node:crypto";
import { StudioError, hashToken } from "./core";
import { calibrationStats } from "./publishing";
import { getResearchSchedule } from "./research-insights";

const SETTINGS_KEY = "automation";
const PLATFORMS: Platform[] = ["adobe_stock", "facebook_reels"];
const PLATFORM_NAME: Record<Platform, string> = { adobe_stock: "Adobe Stock", facebook_reels: "Reels" };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY));
  return parseSettings(row?.value);
}

export async function saveAutomationSettings(next: AutomationSettings): Promise<AutomationSettings> {
  const r = automationSettingsSchema.safeParse(next);
  if (!r.success) throw new StudioError(`Pengaturan tidak valid: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: r.data })
    .onConflictDoUpdate({ target: settings.key, set: { value: r.data, updatedAt: new Date() } });
  return r.data;
}

// ---------------------------------------------------------------------------
// Agent activity
// ---------------------------------------------------------------------------

/** Called by the MCP route for every authenticated request; tool calls are logged too. */
export async function recordAgentRequest(agentId: string, tool: string | null): Promise<void> {
  await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId));
  if (tool) await db.insert(agentActivity).values({ agentId, tool });
}

function startOfStudioDay(now = new Date()): Date {
  return new Date(`${studioToday(now)}T00:00:00+07:00`);
}

export async function agentsOverview(now = new Date()) {
  const s = await getAutomationSettings();
  const rows = await db.select().from(agents).orderBy(agents.createdAt);
  const since = startOfStudioDay(now);
  const calls = await db
    .select({ agentId: agentActivity.agentId, n: count() })
    .from(agentActivity)
    .where(gte(agentActivity.createdAt, since))
    .groupBy(agentActivity.agentId);
  const lastTools = await db
    .selectDistinctOn([agentActivity.agentId], { agentId: agentActivity.agentId, tool: agentActivity.tool, at: agentActivity.createdAt })
    .from(agentActivity)
    .orderBy(agentActivity.agentId, desc(agentActivity.createdAt));
  const queue = await db
    .select({ status: jobs.status, n: count() })
    .from(jobs)
    .groupBy(jobs.status);
  const queued = (role: keyof typeof ROLE_QUEUES) =>
    queue.filter((q) => ROLE_QUEUES[role].includes(q.status)).reduce((a, q) => a + q.n, 0);

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    model: a.model,
    active: a.active,
    lastSeenAt: a.lastSeenAt,
    health: agentHealth(a.lastSeenAt, now, s.agentQuietHours),
    callsToday: calls.find((c) => c.agentId === a.id)?.n ?? 0,
    lastTool: lastTools.find((t) => t.agentId === a.id) ?? null,
    queue: a.role === "rina" || a.role === "rina_scout" || a.role === "admin" ? null : queued(a.role),
  }));
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/** Spend attributed to a platform since the start of the studio day (WIB). */
export async function spentToday(platform: Platform, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${usageCosts.costUsd}), 0)::float` })
    .from(usageCosts)
    .innerJoin(jobs, eq(usageCosts.jobId, jobs.id))
    .where(and(eq(jobs.platform, platform), gte(usageCosts.createdAt, startOfStudioDay(now))));
  return Math.round((r?.total ?? 0) * 100) / 100;
}

export async function budgetOverview(now = new Date()) {
  const s = await getAutomationSettings();
  return Promise.all(
    PLATFORMS.map(async (p) => {
      const spent = await spentToday(p, now);
      return { platform: p, spentUsd: spent, limitUsd: s.budget.dailyUsd[p], ...dailyBudgetState(spent, s.budget.dailyUsd[p]) };
    }),
  );
}

/** Platforms whose daily budget is used up; get_next_job skips their jobs. */
export async function blockedPlatforms(now = new Date()): Promise<Platform[]> {
  return (await budgetOverview(now)).filter((b) => b.blocked).map((b) => b.platform);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type NewNotification = { key: string; severity: "info" | "warn" | "critical"; title: string; body: string; href?: string };

/** Inserts once per dedupe key; new warn/critical items are also sent to the webhook, if set. */
export async function notify(n: NewNotification, webhookUrl?: string | null): Promise<boolean> {
  const inserted = await db
    .insert(notifications)
    .values({ dedupeKey: n.key, severity: n.severity, title: n.title, body: n.body, href: n.href })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  if (inserted.length && webhookUrl && n.severity !== "info") {
    const text = `[${n.severity.toUpperCase()}] ${n.title}\n${n.body}`;
    // Discord reads "content", Slack reads "text".
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, text }),
      signal: AbortSignal.timeout(5000),
    }).catch((e) => console.error("[notify] webhook failed", e));
  }
  return inserted.length > 0;
}

export async function listNotifications(limit = 20) {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadNotificationCount(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(notifications).where(isNull(notifications.readAt));
  return r?.n ?? 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const where = ids?.length ? and(isNull(notifications.readAt), inArray(notifications.id, ids)) : isNull(notifications.readAt);
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}

// ---------------------------------------------------------------------------
// Periodic tick (cron)
// ---------------------------------------------------------------------------

export async function runAutomationTick(now = new Date()) {
  const s = await getAutomationSettings();
  const day = studioToday(now);
  const created: string[] = [];
  const push = async (n: NewNotification) => {
    if (await notify(n, s.webhookUrl)) created.push(n.key);
  };

  // 1. Jobs stuck in an agent stage.
  const active = await db
    .select({ id: jobs.id, status: jobs.status, platform: jobs.platform, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(lt(jobs.updatedAt, new Date(now.getTime() - s.staleQueueHours * 3_600_000)));
  for (const j of stalledJobs(active, now, s.staleQueueHours)) {
    await push({
      key: `stale:${j.id}:${j.status}`,
      severity: "warn",
      title: `${j.agent} belum menyentuh job ${j.hours} jam`,
      body: `Job ${j.id.slice(0, 8)} (${PLATFORM_NAME[j.platform]}) masih di tahap ${j.status}. Pastikan jadwal ${j.agent} berjalan.`,
      href: "/dashboard/agents",
    });
  }

  // 2. Agents that went quiet or never connected.
  for (const a of await agentsOverview(now)) {
    if (a.role === "admin" || !a.active || a.health === "active") continue;
    await push({
      key: `quiet:${a.id}:${day}`,
      severity: a.health === "never" ? "info" : "warn",
      title: a.health === "never" ? `${a.name} belum pernah terhubung` : `${a.name} tidak aktif lebih dari ${s.agentQuietHours} jam`,
      body: "Cek jadwal (scheduled task) dan token MCP agen ini di halaman Agen.",
      href: "/dashboard/agents",
    });
  }

  for (const p of PLATFORMS) {
    // 3. Scans and research that were missed.
    const schedule = await getResearchSchedule(p, now);
    for (const d of schedule.due) {
      if (d.action === "trend_scan" && d.overdue) {
        await push({
          key: `scan:${p}:${d.day}:${d.slot}`,
          severity: "info",
          title: `Pindaian tren ${PLATFORM_NAME[p]} slot ${d.slot} terlewat`,
          body: `Rina-Scout belum mengirim pindaian slot ${d.slot} untuk ${d.day}. Rina tetap bisa riset tanpa pindaian.`,
          href: `/dashboard/research?platform=${p}`,
        });
      }
      if (d.action === "deep_research" && d.overdue) {
        await push({
          key: `research:${p}:${d.day}`,
          severity: "warn",
          title: `Riset mendalam ${PLATFORM_NAME[p]} ${d.day} terlewat`,
          body: `Ada ${d.scans} pindaian tren yang belum diriset Rina, jadi laporan harian dan siklus produksi tertunda.`,
          href: `/dashboard/research?platform=${p}`,
        });
      }
    }
    // 4. Daily budget used up.
    const spent = await spentToday(p, now);
    if (dailyBudgetState(spent, s.budget.dailyUsd[p]).blocked) {
      await push({
        key: `budget:${p}:${day}`,
        severity: "critical",
        title: `Anggaran harian ${PLATFORM_NAME[p]} habis`,
        body: `Terpakai $${spent.toFixed(2)} dari $${s.budget.dailyUsd[p]}. Agen berhenti mengambil job ${PLATFORM_NAME[p]} sampai besok (WIB) atau sampai batasnya dinaikkan.`,
        href: "/dashboard/automation",
      });
    }
    // 5. Calibration reached while auto-publish is still off.
    if (!s.autoPublish[p] && (await calibrationStats(p)).readyForAutoMode) {
      await push({
        key: `ready:${p}`,
        severity: "info",
        title: `${PLATFORM_NAME[p]} siap publikasi otomatis`,
        body: "Semua syarat kalibrasi tercapai. Kamu bisa mengaktifkan publikasi otomatis di halaman Otomasi.",
        href: "/dashboard/automation",
      });
    }
  }

  // 6. Halted cycles.
  for (const c of await db.select().from(cycles).where(eq(cycles.status, "halted"))) {
    await push({
      key: `halted:${c.id}`,
      severity: "warn",
      title: `Siklus ${PLATFORM_NAME[c.platform]} dihentikan`,
      body: c.haltReason ?? "Siklus berhenti.",
      href: "/dashboard#halted",
    });
  }

  // 7. Approvals waiting on the human for more than a day.
  const [waiting] = await db
    .select({ n: count() })
    .from(publications)
    .where(and(eq(publications.status, "awaiting_approval"), lt(publications.createdAt, new Date(now.getTime() - 24 * 3_600_000))));
  if (waiting.n > 0) {
    await push({
      key: `approval-wait:${day}`,
      severity: "info",
      title: `${waiting.n} item menunggu approval lebih dari sehari`,
      body: "Aset yang sudah lolos Kechlyn menunggu keputusanmu.",
      href: "/dashboard",
    });
  }

  // Housekeeping: activity older than 30 days.
  await db.delete(agentActivity).where(lt(agentActivity.createdAt, new Date(now.getTime() - 30 * 24 * 3_600_000)));

  await db
    .insert(settings)
    .values({ key: "lastTick", value: now.toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: now.toISOString(), updatedAt: now } });
  return { ranAt: now.toISOString(), newNotifications: created };
}

// ---------------------------------------------------------------------------
// Agent tokens & last tick
// ---------------------------------------------------------------------------

/** Issues a new MCP token for one agent. The old token stops working immediately. */
export async function rotateAgentToken(agentId: string): Promise<{ name: string; role: string; token: string }> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new StudioError("Agen tidak ditemukan");
  const token = `rs_${agent.role}_${randomBytes(24).toString("base64url")}`;
  await db.update(agents).set({ tokenHash: hashToken(token) }).where(eq(agents.id, agentId));
  return { name: agent.name, role: agent.role, token };
}

export async function lastTickAt(): Promise<Date | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "lastTick"));
  return row ? new Date(String(row.value)) : null;
}
