/**
 * Research data Rina works from (daily merge, rollups, schedule) and performance import.
 * The numbers are computed here; Rina writes the interpretation (docs/design.md §3).
 */
import { and, asc, between, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  performance,
  publications,
  researchFindings,
  researchReports,
  researchSessions,
  type Platform,
} from "@/lib/db/schema";
import {
  CHILD_LEVEL,
  SLOT_HOURS,
  addDays,
  currentSlot,
  overlaps,
  periodOf,
  previousPeriod,
  studioToday,
  type Period,
  type ReportLevel,
} from "../research-periods";
import { aggregateTopics, keywordPerformance, withTrends, type FindingRow } from "../research-rollup";
import type { PerformanceRow } from "../performance-csv";

async function findingsIn(platform: Platform, p: Period): Promise<FindingRow[]> {
  const rows = await db
    .select({ f: researchFindings, model: researchSessions.model, day: researchSessions.day })
    .from(researchFindings)
    .innerJoin(researchSessions, eq(researchFindings.sessionId, researchSessions.id))
    .where(and(eq(researchFindings.platform, platform), between(researchSessions.day, p.start, p.end)));
  return rows.map(({ f, model, day }) => ({
    topic: f.topic,
    keywords: f.keywords,
    demandScore: f.demandScore,
    competitionScore: f.competitionScore,
    confidence: f.confidence,
    verified: f.verified,
    seasonality: f.seasonality,
    sessionId: f.sessionId,
    model,
    day,
  }));
}

async function reportsIn(platform: Platform, level: ReportLevel, p: Period) {
  const rows = await db
    .select()
    .from(researchReports)
    .where(
      and(
        eq(researchReports.platform, platform),
        eq(researchReports.level, level),
        lte(researchReports.periodStart, p.end),
        gte(researchReports.periodEnd, p.start),
      ),
    )
    .orderBy(asc(researchReports.periodStart));
  return rows.filter((r) => overlaps({ start: r.periodStart, end: r.periodEnd }, p));
}

async function existingReport(platform: Platform, level: ReportLevel, p: Period) {
  const [r] = await db
    .select({ id: researchReports.id })
    .from(researchReports)
    .where(
      and(eq(researchReports.platform, platform), eq(researchReports.level, level), eq(researchReports.periodStart, p.start)),
    );
  return r?.id ?? null;
}

/** Sales and refusals in a period, per keyword and in total. */
async function performanceIn(platform: Platform, p: Period) {
  const pubs = await db
    .select({ id: publications.id, keywords: publications.keywords, status: publications.status, updatedAt: publications.updatedAt })
    .from(publications)
    .where(and(eq(publications.platform, platform), inArray(publications.status, ["published", "platform_rejected"])));
  const sales = pubs.length
    ? await db
        .select({
          publicationId: performance.publicationId,
          downloads: sql<number>`coalesce(sum((${performance.metrics}->>'downloads')::numeric), 0)::float`,
          revenue: sql<number>`coalesce(sum(${performance.revenueUsd}), 0)::float`,
        })
        .from(performance)
        .where(and(inArray(performance.publicationId, pubs.map((x) => x.id)), between(performance.day, p.start, p.end)))
        .groupBy(performance.publicationId)
    : [];
  const byPub = new Map(sales.map((s) => [s.publicationId, s]));
  const startTs = new Date(`${p.start}T00:00:00+07:00`);
  const endTs = new Date(`${addDays(p.end, 1)}T00:00:00+07:00`);

  const perf = pubs.map((x) => {
    const refusedInPeriod = x.status === "platform_rejected" && x.updatedAt >= startTs && x.updatedAt < endTs;
    return {
      keywords: x.keywords,
      status: x.status === "published" ? "published" : refusedInPeriod ? "platform_rejected" : "other",
      downloads: byPub.get(x.id)?.downloads ?? 0,
      revenueUsd: byPub.get(x.id)?.revenue ?? 0,
    };
  });
  return {
    totals: {
      downloads: perf.reduce((a, b) => a + b.downloads, 0),
      revenueUsd: Math.round(perf.reduce((a, b) => a + b.revenueUsd, 0) * 100) / 100,
      refusedInPeriod: perf.filter((x) => x.status === "platform_rejected").length,
    },
    keywords: keywordPerformance(perf.filter((x) => x.status !== "other" || x.downloads > 0)),
  };
}

// ---------------------------------------------------------------------------
// Daily merge
// ---------------------------------------------------------------------------

export async function getDailyMergeData(platform: Platform, day: string) {
  const sessions = await db
    .select({ id: researchSessions.id, slot: researchSessions.slot, model: researchSessions.model })
    .from(researchSessions)
    .where(and(eq(researchSessions.platform, platform), eq(researchSessions.day, day)))
    .orderBy(asc(researchSessions.slot));
  const today = await findingsIn(platform, { start: day, end: day });
  const lastWeek = await findingsIn(platform, { start: addDays(day, -7), end: addDays(day, -1) });
  const { topics, faded } = withTrends(aggregateTopics(today), aggregateTopics(lastWeek));
  const slotsDone = new Set(sessions.map((s) => s.slot));

  return {
    platform,
    day,
    existingReportId: await existingReport(platform, "daily", { start: day, end: day }),
    sessions,
    missingSlots: SLOT_HOURS.filter((s) => !slotsDone.has(s.slot)).map((s) => s.slot),
    findingCount: today.length,
    unverifiedTopics: topics.filter((t) => !t.verified).length,
    /** Ranked topics of the day; trend compares with the previous 7 days. */
    topics,
    fadedSinceLastWeek: faded,
    guidance:
      "Pilih peluang dari topics (urut opportunityScore). Turunkan prioritas topik unverified. Terbitkan dengan publish_report level daily; opportunities diurutkan untuk Shion.",
  };
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export async function getRollupData(level: Exclude<ReportLevel, "daily">, platform: Platform, day: string) {
  const period = periodOf(level, day);
  const prev = previousPeriod(level, day);
  const childLevel = CHILD_LEVEL[level];
  const [current, before, children, perf] = await Promise.all([
    findingsIn(platform, period),
    findingsIn(platform, prev),
    reportsIn(platform, childLevel, period),
    performanceIn(platform, period),
  ]);
  const { topics, faded } = withTrends(aggregateTopics(current), aggregateTopics(before));

  return {
    level,
    platform,
    period,
    previousPeriod: prev,
    existingReportId: await existingReport(platform, level, period),
    childLevel,
    children: children.map((c) => ({
      id: c.id,
      period: { start: c.periodStart, end: c.periodEnd },
      summary: c.summary.slice(0, 800),
      topOpportunities: (c.opportunities as unknown[]).slice(0, 5),
    })),
    topics: topics.slice(0, 40),
    rising: topics.filter((t) => t.trend === "up" || t.trend === "new").slice(0, 10),
    falling: topics.filter((t) => t.trend === "down").slice(0, 10),
    faded,
    performance: perf,
    guidance:
      "Bandingkan prediksi riset (topics) dengan performance (keyword yang laku dan ditolak). Tulis summary berisi pelajaran dan arah periode berikutnya, lalu publish_report dengan child_report_ids = semua children.",
  };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type DueAction =
  | { action: "research_session"; day: string; slot: number; overdue: boolean }
  | { action: "publish_daily"; day: string }
  | { action: "publish_rollup"; level: Exclude<ReportLevel, "daily">; day: string; period: Period };

/** What Rina should do now for a platform, oldest first. */
export async function getResearchSchedule(platform: Platform, now = new Date()) {
  const today = studioToday(now);
  const slot = currentSlot(now);
  const yesterday = addDays(today, -1);

  const sessions = await db
    .select({ day: researchSessions.day, slot: researchSessions.slot, model: researchSessions.model })
    .from(researchSessions)
    .where(and(eq(researchSessions.platform, platform), between(researchSessions.day, yesterday, today)));
  const due: DueAction[] = [];

  // Yesterday's daily report, if research happened but nobody merged it.
  const hadYesterday = sessions.some((s) => s.day === yesterday);
  if (hadYesterday && !(await existingReport(platform, "daily", periodOf("daily", yesterday)))) {
    due.push({ action: "publish_daily", day: yesterday });
  }

  for (const s of SLOT_HOURS.filter((x) => x.slot <= slot)) {
    if (!sessions.some((x) => x.day === today && x.slot === s.slot)) {
      due.push({ action: "research_session", day: today, slot: s.slot, overdue: s.slot < slot });
    }
  }
  const todayDaily = await existingReport(platform, "daily", periodOf("daily", today));
  if (!todayDaily && sessions.some((x) => x.day === today && x.slot === 3)) {
    due.push({ action: "publish_daily", day: today });
  }

  // Rollups: the previous complete period, and the current one on its last day.
  for (const level of ["weekly", "monthly", "yearly"] as const) {
    const candidates = [previousPeriod(level, today)];
    const cur = periodOf(level, today);
    if (cur.end === today && todayDaily) candidates.push(cur);
    for (const p of candidates) {
      if (await existingReport(platform, level, p)) continue;
      const kids = await reportsIn(platform, CHILD_LEVEL[level], p);
      if (kids.length) due.push({ action: "publish_rollup", level, day: p.start, period: p });
    }
  }

  return {
    platform,
    now: now.toISOString(),
    today,
    currentSlot: slot,
    slots: SLOT_HOURS.map((s) => ({
      ...s,
      models: sessions.filter((x) => x.day === today && x.slot === s.slot).map((x) => x.model),
    })),
    todayDailyReportId: todayDaily,
    due,
  };
}

// ---------------------------------------------------------------------------
// Performance import
// ---------------------------------------------------------------------------

export async function importPerformance(platform: Platform, rows: PerformanceRow[]) {
  const names = [...new Set(rows.map((r) => r.fileName))];
  const pubs = names.length
    ? await db
        .select({ id: publications.id, fileName: publications.fileName })
        .from(publications)
        .where(and(eq(publications.platform, platform), inArray(publications.fileName, names)))
    : [];
  const byName = new Map(pubs.map((p) => [p.fileName!, p.id]));

  const matched = rows.filter((r) => byName.has(r.fileName));
  for (const r of matched) {
    await db
      .insert(performance)
      .values({
        publicationId: byName.get(r.fileName)!,
        day: r.day,
        metrics: { downloads: r.downloads },
        revenueUsd: r.revenueUsd,
      })
      .onConflictDoUpdate({
        target: [performance.publicationId, performance.day],
        set: { metrics: { downloads: r.downloads }, revenueUsd: r.revenueUsd },
      });
  }
  return {
    imported: matched.length,
    unmatched: [...new Set(rows.filter((r) => !byName.has(r.fileName)).map((r) => r.fileName))],
  };
}

/** Totals and best sellers over the last `days` days, for the dashboard and for Rina. */
export async function performanceOverview(platform: Platform, days = 30, now = new Date()) {
  const end = studioToday(now);
  const p = { start: addDays(end, -(days - 1)), end };
  const perDay = await db
    .select({
      day: performance.day,
      downloads: sql<number>`coalesce(sum((${performance.metrics}->>'downloads')::numeric), 0)::float`,
      revenue: sql<number>`coalesce(sum(${performance.revenueUsd}), 0)::float`,
    })
    .from(performance)
    .innerJoin(publications, eq(performance.publicationId, publications.id))
    .where(and(eq(publications.platform, platform), between(performance.day, p.start, p.end)))
    .groupBy(performance.day)
    .orderBy(asc(performance.day));
  const top = await db
    .select({
      title: publications.title,
      fileName: publications.fileName,
      downloads: sql<number>`coalesce(sum((${performance.metrics}->>'downloads')::numeric), 0)::float`,
      revenue: sql<number>`coalesce(sum(${performance.revenueUsd}), 0)::float`,
    })
    .from(performance)
    .innerJoin(publications, eq(performance.publicationId, publications.id))
    .where(and(eq(publications.platform, platform), between(performance.day, p.start, p.end)))
    .groupBy(publications.id, publications.title, publications.fileName)
    .orderBy(sql`4 desc, 3 desc`) // revenue, then downloads
    .limit(10);
  return {
    period: p,
    perDay,
    totals: {
      downloads: perDay.reduce((a, b) => a + b.downloads, 0),
      revenueUsd: Math.round(perDay.reduce((a, b) => a + b.revenue, 0) * 100) / 100,
    },
    top,
    keywords: (await performanceIn(platform, p)).keywords,
  };
}
