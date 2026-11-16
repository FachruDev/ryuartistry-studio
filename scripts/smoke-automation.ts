/**
 * End-to-end smoke test of Phase 4 automation over MCP: budgets, per-job cap, agent activity,
 * cron tick + notifications, auto-publish, and the new dashboard pages. Restores settings and
 * deletes everything it created.
 *
 *   bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-automation.ts [baseUrl]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, cycles, ideas, jobs, publications, reviews, transitions, usageCosts } from "@/lib/db/schema";
import { agentActivity, notifications } from "@/lib/db/schema-automation";
import { operatorCookie } from "./lib/operator-cookie";
import {
  agentsOverview,
  getAutomationSettings,
  listNotifications,
  markNotificationsRead,
  saveAutomationSettings,
  unreadNotificationCount,
} from "@/lib/studio/service";
import { assertNoLiveQueue } from "./lib/live-queue-guard";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const startedAt = new Date();
const cyclesMade: string[] = [];
const step = (m: string) => console.log(`✓ ${m}`);
function expect(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function connect(role: string) {
  const c = new Client({ name: `smoke-${role}`, version: "0" });
  await c.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", base), {
      requestInit: { headers: { Authorization: `Bearer ${process.env[`STUDIO_TOKEN_${role.toUpperCase()}`]}` } },
    }),
  );
  return c;
}
async function call(c: Client, name: string, a: Record<string, unknown> = {}) {
  const r = await c.callTool({ name, arguments: a });
  const t = (r.content as { text: string }[])[0]?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${t}`);
  return JSON.parse(t);
}
async function callError(c: Client, name: string, a: Record<string, unknown>) {
  const r = await c.callTool({ name, arguments: a });
  expect(r.isError, `${name} should fail`);
  return (r.content as { text: string }[])[0]?.text ?? "";
}

async function run(original: Awaited<ReturnType<typeof getAutomationSettings>>) {
  const [admin, shion, kechlyn] = await Promise.all(["admin", "shion", "kechlyn"].map(connect));
  await saveAutomationSettings({ ...original, budget: { dailyUsd: { adobe_stock: 0.5, facebook_reels: null }, perJobUsd: 0.3 } });

  const openAndClaim = async () => {
    const { cycleIds } = await call(admin, "open_cycle", { platform: "adobe_stock" });
    cyclesMade.push(...cycleIds);
    return (await call(shion, "get_next_job", { role: "shion" })).job.id as string;
  };

  // Per-job cap
  const jobA = await openAndClaim();
  const cost = await call(shion, "report_cost", { job_id: jobA, description: "uji", cost_usd: 0.4 });
  const [a] = await db.select().from(jobs).where(eq(jobs.id, jobA));
  expect(cost.jobHalted && a.status === "halted", `per-job cap: ${JSON.stringify(cost)} ${a.status}`);
  step("biaya job $0,40 > batas $0,30 → job dihentikan otomatis");

  // Daily budget
  const jobB = await openAndClaim();
  await call(shion, "report_cost", { job_id: jobB, description: "uji", cost_usd: 0.2 });
  const { cycleIds } = await call(admin, "open_cycle", { platform: "adobe_stock" });
  cyclesMade.push(...cycleIds);
  const blocked = await callError(shion, "get_next_job", { role: "shion" });
  expect(blocked.includes("Anggaran harian habis") && blocked.includes("adobe_stock"), blocked);
  step("pemakaian harian $0,60 ≥ $0,50 → get_next_job menolak job Adobe dengan pesan jelas");

  // Activity
  const shionRow = (await agentsOverview()).find((x) => x.role === "shion")!;
  expect(shionRow.health === "active" && shionRow.callsToday >= 4 && shionRow.lastTool, JSON.stringify(shionRow));
  step(`aktivitas agen tercatat: Shion aktif, ${shionRow.callsToday} panggilan hari ini, tool terakhir ${shionRow.lastTool?.tool}`);

  // Cron tick
  const anon = await fetch(new URL("/api/cron/tick", base));
  expect(anon.status === 401, `tick without secret: ${anon.status}`);
  const auth = { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } };
  const t1 = await (await fetch(new URL("/api/cron/tick", base), auth)).json();
  expect(t1.newNotifications.some((k: string) => k.startsWith("budget:adobe_stock:")), JSON.stringify(t1));
  const t2 = await (await fetch(new URL("/api/cron/tick", base), auth)).json();
  expect(!t2.newNotifications.some((k: string) => k.startsWith("budget:")), "budget notification must not repeat");
  const notes = await listNotifications(50);
  expect(notes.some((n) => n.title.includes("melewati batas biaya")), "job-budget notification");
  step(`cron tick: 401 tanpa secret, notifikasi anggaran dibuat sekali (${t1.newNotifications.length} baru, lalu ${t2.newNotifications.length})`);

  // Auto-publish: seed 50 human-approved publications so calibration is ready.
  await saveAutomationSettings({ ...original, autoPublish: { adobe_stock: true, facebook_reels: false } });
  const [c] = await db.insert(cycles).values({ platform: "adobe_stock", line: "image", day: "2020-01-06" }).returning();
  cyclesMade.push(c.id);
  const [seedJob] = await db.insert(jobs).values({ cycleId: c.id, platform: "adobe_stock", line: "image", ideaNumber: 1, status: "published" }).returning();
  const [seedAsset] = await db.insert(assets).values({ jobId: seedJob.id, version: 1, s3Key: "studio/smoke/x.jpg", contentType: "image/jpeg" }).returning();
  await db.insert(publications).values(
    Array.from({ length: 50 }, (_, i) => ({
      jobId: seedJob.id, assetId: seedAsset.id, platform: "adobe_stock" as const, title: `Seed ${i}`,
      aiLabel: true, status: "published" as const, humanScore: 8, agentScore: 8,
    })),
  );
  const [prepJob] = await db.insert(jobs).values({ cycleId: c.id, platform: "adobe_stock", line: "image", ideaNumber: 2, status: "publish_prep" }).returning();
  await db.insert(assets).values({ jobId: prepJob.id, version: 1, s3Key: "studio/smoke/y.jpg", contentType: "image/jpeg", width: 2400, height: 1800 });
  const pub = await call(kechlyn, "submit_publication_prep", {
    job_id: prepJob.id, title: "Auto approved paper texture", keywords: ["paper", "texture", "overlay", "folded", "craft"], category: 8, ai_label: true,
  });
  const [row] = await db.select().from(publications).where(eq(publications.id, pub.publicationId));
  const [after] = await db.select().from(jobs).where(eq(jobs.id, prepJob.id));
  expect(pub.autoPublish.auto && pub.nextStatus === "scheduled" && row.autoApproved && row.status === "approved" && after.status === "scheduled", JSON.stringify(pub));
  step("publikasi otomatis: kalibrasi tercapai + sakelar aktif → disetujui tanpa manusia, ditandai autoApproved");

  // Dashboard pages + notifications read
  const cookie = { headers: { Cookie: await operatorCookie() } };
  const agentsPage = await (await fetch(new URL("/dashboard/agents", base), cookie)).text();
  const autoPage = await (await fetch(new URL("/dashboard/automation", base), cookie)).text();
  expect(agentsPage.includes("Kit koneksi") && agentsPage.includes("/api/cron/tick"), "agents page");
  expect(autoPage.includes("Pemakaian anggaran") && autoPage.includes("Publikasi otomatis"), "automation page");
  await markNotificationsRead();
  expect((await unreadNotificationCount()) === 0, "mark read");
  step("halaman Agen & Pengaturan tampil; semua notifikasi bisa ditandai dibaca");

  await Promise.all([admin, shion, kechlyn].map((x) => x.close()));
  console.log("\nAUTOMATION SMOKE TEST PASSED");
}

async function cleanup(original: Awaited<ReturnType<typeof getAutomationSettings>>) {
  await saveAutomationSettings(original);
  if (cyclesMade.length) {
    const ids = (await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.cycleId, cyclesMade))).map((j) => j.id);
    if (ids.length) {
      await db.delete(publications).where(inArray(publications.jobId, ids));
      await db.delete(usageCosts).where(inArray(usageCosts.jobId, ids));
      for (const t of [transitions, reviews, ideas, assets] as const) await db.delete(t).where(inArray(t.jobId, ids));
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }
    await db.delete(cycles).where(inArray(cycles.id, cyclesMade));
  }
  await db.delete(notifications).where(gte(notifications.createdAt, startedAt));
  await db.delete(agentActivity).where(and(gte(agentActivity.createdAt, startedAt)));
  console.log("(data uji dibersihkan, pengaturan dikembalikan)");
}

const original = await getAutomationSettings();
await assertNoLiveQueue("AUTOMATION SMOKE TEST");
try {
  await run(original);
} catch (e) {
  console.error("\nAUTOMATION SMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await cleanup(original);
  process.exit(process.exitCode ?? 0);
}
