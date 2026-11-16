/**
 * End-to-end smoke test of Rina's research flow over MCP (Phase 2).
 * Uses a fixed past week (2020-01-06 Mon .. 2020-01-12 Sun) so it never touches real research,
 * and deletes everything it created.
 *
 *   bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-research.ts [baseUrl]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  cycles,
  jobs,
  performance,
  publications,
  researchReports,
  researchSessions,
  transitions,
} from "@/lib/db/schema";
import { importPerformance, performanceOverview } from "@/lib/studio/service";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const DAY = "2020-01-06";
const WEEK_END = "2020-01-12";
const openedCycles: string[] = [];
const step = (m: string) => console.log(`✓ ${m}`);
function expect(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function connect(role: string) {
  const client = new Client({ name: `smoke-${role}`, version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", base), {
      requestInit: { headers: { Authorization: `Bearer ${process.env[`STUDIO_TOKEN_${role.toUpperCase()}`]}` } },
    }),
  );
  return client;
}

async function call(c: Client, name: string, a: Record<string, unknown> = {}) {
  const r = await c.callTool({ name, arguments: a });
  const text = (r.content as { text: string }[])[0]?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}

async function callError(c: Client, name: string, a: Record<string, unknown>) {
  const r = await c.callTool({ name, arguments: a });
  expect(r.isError, `${name} should fail`);
  return (r.content as { text: string }[])[0]?.text ?? "";
}

const finding = (topic: string, over: Record<string, unknown> = {}) => ({
  topic,
  keywords: ["paper", "texture", "overlay"],
  demandScore: 8,
  competitionScore: 3,
  seasonality: "evergreen",
  sources: [{ url: "https://example.com/trend", accessedAt: DAY }],
  confidence: 6,
  ...over,
});

async function run() {
  const rina = await connect("rina");
  const tools = (await rina.listTools()).tools.map((t) => t.name);
  expect(tools.includes("get_research_schedule") && !tools.includes("submit_idea"), "Rina tool set wrong");
  const schedule = await call(rina, "get_research_schedule", { platform: "adobe_stock" });
  expect(schedule.today && schedule.slots.length === 3, "schedule shape");
  step(`get_research_schedule: hari ini ${schedule.today}, slot ${schedule.currentSlot}, ${schedule.due.length} jatuh tempo`);

  await call(rina, "submit_research_session", { platform: "adobe_stock", day: DAY, slot: 1, model: "claude", findings: [finding("Folded paper texture"), finding("Neon grid background", { sources: [], confidence: 9 })] });
  await call(rina, "submit_research_session", { platform: "adobe_stock", day: DAY, slot: 1, model: "grok", findings: [finding("folded paper texture!", { confidence: 7 })] });
  await call(rina, "submit_research_session", { platform: "adobe_stock", day: DAY, slot: 3, model: "claude", findings: [finding("Folded paper texture")] });
  const dup = await callError(rina, "submit_research_session", { platform: "adobe_stock", day: DAY, slot: 1, model: "claude", findings: [finding("x topic")] });
  expect(dup.includes("sudah ada"), dup);
  step("3 sesi tersimpan (Claude + Grok di slot yang sama), sesi ganda ditolak");

  const merge = await call(rina, "get_daily_merge_data", { platform: "adobe_stock", day: DAY });
  const paper = merge.topics.find((t: { key: string }) => t.key === "folded paper texture");
  const neon = merge.topics.find((t: { key: string }) => t.key === "neon grid background");
  expect(paper?.sessions === 3 && paper.models === 2 && merge.missingSlots.join() === "2", JSON.stringify(merge.missingSlots));
  expect(neon && !neon.verified && neon.adjustedConfidence <= 5, "unverified topic not capped");
  expect(merge.topics[0].key === "folded paper texture", "ranking wrong");
  step(`daily merge: topik digabung lintas 3 sesi/2 model (keyakinan ${paper.adjustedConfidence}), topik tanpa sumber dibatasi ${neon.adjustedConfidence}`);

  const misaligned = await callError(rina, "publish_report", {
    level: "weekly", platform: "adobe_stock", period_start: "2020-01-07", period_end: "2020-01-13",
    summary: "Ringkasan minggu yang salah periode untuk diuji.", child_report_ids: [],
  });
  expect(misaligned.includes("2020-01-06 s/d 2020-01-12"), misaligned);
  const noOpp = await callError(rina, "publish_report", { level: "daily", platform: "adobe_stock", period_start: DAY, period_end: DAY, summary: "Laporan harian tanpa peluang untuk diuji." });
  expect(noOpp.includes("opportunities"), noOpp);
  step("periode tidak sesuai kalender dan laporan harian tanpa peluang ditolak");

  const daily = await call(rina, "publish_report", {
    level: "daily", platform: "adobe_stock", period_start: DAY, period_end: DAY,
    summary: "Tekstur kertas lipat konsisten muncul di tiga sesi dan dua model; persaingan rendah.",
    opportunities: [{ topic: "Folded paper texture", keywords: ["paper", "texture"], rationale: "Permintaan tinggi, persaingan rendah", priority: 9 }],
  });
  openedCycles.push(...daily.openedCycles);
  expect(daily.openedCycles.length === 5, `expected 5 cycles, got ${daily.openedCycles.length}`);
  const again = await callError(rina, "publish_report", {
    level: "daily", platform: "adobe_stock", period_start: DAY, period_end: DAY, summary: "Duplikat laporan harian untuk diuji.",
    opportunities: [{ topic: "Duplikat uji", keywords: ["uji"], rationale: "duplikat uji", priority: 1 }],
  });
  expect(again.includes("sudah ada"), again);
  step("laporan harian terbit → 5 siklus produksi dibuka; laporan ganda ditolak");

  const rollup = await call(rina, "get_rollup_data", { level: "weekly", platform: "adobe_stock", day: "2020-01-09" });
  expect(rollup.period.start === DAY && rollup.period.end === WEEK_END && rollup.children.length === 1, "rollup data");
  expect(rollup.topics[0].trend === "new", "first-week topics should be new");
  const noKids = await callError(rina, "publish_report", { level: "weekly", platform: "adobe_stock", period_start: DAY, period_end: WEEK_END, summary: "Rollup mingguan tanpa laporan anak untuk diuji." });
  expect(noKids.includes("child_report_ids"), noKids);
  await call(rina, "publish_report", {
    level: "weekly", platform: "adobe_stock", period_start: DAY, period_end: WEEK_END,
    summary: "Minggu pertama: tekstur kertas memimpin; topik tanpa sumber perlu diverifikasi.",
    child_report_ids: rollup.children.map((c: { id: string }) => c.id),
  });
  step("rollup mingguan: periode Senin-Minggu, tren 'baru', wajib child_report_ids, lalu terbit");

  // Performance import, matched against a publication by file name.
  const [cycle] = await db.insert(cycles).values({ platform: "adobe_stock", line: "image", day: DAY }).returning();
  openedCycles.push(cycle.id);
  const [job] = await db.insert(jobs).values({ cycleId: cycle.id, platform: "adobe_stock", line: "image", ideaNumber: 1, status: "published" }).returning();
  const [asset] = await db.insert(assets).values({ jobId: job.id, version: 1, s3Key: "studio/smoke/none.jpg", contentType: "image/jpeg" }).returning();
  await db.insert(publications).values({
    jobId: job.id, assetId: asset.id, platform: "adobe_stock", title: "Smoke paper", keywords: ["paper", "texture"],
    fileName: "smoke-paper-00000000.jpg", aiLabel: true, status: "published",
  });
  const today = new Date().toISOString().slice(0, 10);
  const imp1 = await importPerformance("adobe_stock", [
    { fileName: "smoke-paper-00000000.jpg", day: today, downloads: 2, revenueUsd: 0.66 },
    { fileName: "unknown.jpg", day: today, downloads: 1, revenueUsd: 0.33 },
  ]);
  await importPerformance("adobe_stock", [{ fileName: "smoke-paper-00000000.jpg", day: today, downloads: 3, revenueUsd: 0.99 }]);
  const perf = await performanceOverview("adobe_stock", 30);
  expect(imp1.imported === 1 && imp1.unmatched[0] === "unknown.jpg", JSON.stringify(imp1));
  expect(perf.totals.downloads === 3 && perf.totals.revenueUsd === 0.99, `re-import should overwrite: ${JSON.stringify(perf.totals)}`);
  expect(perf.keywords[0]?.keyword === "paper", "keyword performance missing");
  const summary = await call(rina, "get_performance_summary", { platform: "adobe_stock", days: 7 });
  expect(summary.totals.revenueUsd === 0.99, "Rina cannot see performance");
  step("impor performa: cocok lewat nama file, impor ulang menimpa, Rina melihat keyword yang laku");

  await rina.close();
  console.log("\nRESEARCH SMOKE TEST PASSED");
}

async function cleanup() {
  const jobIds = openedCycles.length
    ? (await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.cycleId, openedCycles))).map((j) => j.id)
    : [];
  if (jobIds.length) {
    const pubIds = (await db.select({ id: publications.id }).from(publications).where(inArray(publications.jobId, jobIds))).map((p) => p.id);
    if (pubIds.length) {
      await db.delete(performance).where(inArray(performance.publicationId, pubIds));
      await db.delete(publications).where(inArray(publications.id, pubIds));
    }
    await db.delete(assets).where(inArray(assets.jobId, jobIds));
    await db.delete(transitions).where(inArray(transitions.jobId, jobIds));
    await db.delete(jobs).where(inArray(jobs.id, jobIds));
  }
  if (openedCycles.length) await db.delete(cycles).where(inArray(cycles.id, openedCycles));
  await db
    .delete(researchReports)
    .where(and(eq(researchReports.platform, "adobe_stock"), inArray(researchReports.periodStart, [DAY])));
  await db.delete(researchSessions).where(and(eq(researchSessions.platform, "adobe_stock"), eq(researchSessions.day, DAY)));
  console.log("(data uji dibersihkan)");
}

try {
  await run();
} catch (e) {
  console.error("\nRESEARCH SMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await cleanup();
  process.exit(process.exitCode ?? 0);
}
