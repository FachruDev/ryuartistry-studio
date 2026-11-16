/** Research (Rina), cost tracking, and read-only queries for the dashboard. */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  cycles,
  ideaGraveyard,
  jobs,
  publications,
  researchFindings,
  researchReports,
  researchSessions,
  transitions,
  usageCosts,
  type Platform,
} from "@/lib/db/schema";
import { presignDownload } from "@/lib/storage";
import { CYCLES_PER_DAILY_REPORT } from "../config";
import { CHILD_LEVEL, isExactPeriod, overlaps, periodOf, studioToday, type ReportLevel } from "../research-periods";
import { StudioError, openCycles, type Agent } from "./core";

// ---------------------------------------------------------------------------
// Rina
// ---------------------------------------------------------------------------

export type FindingInput = {
  topic: string;
  keywords: string[];
  demandScore: number;
  competitionScore: number;
  seasonality: string;
  sources: { url: string; accessedAt: string }[];
  confidence: number;
  notes?: string;
};

export async function submitResearchSession(
  agent: Agent,
  input: { platform: Platform; day: string; slot: number; model: string; notes?: string; findings: FindingInput[] },
) {
  const [dup] = await db
    .select({ id: researchSessions.id })
    .from(researchSessions)
    .where(
      and(
        eq(researchSessions.platform, input.platform),
        eq(researchSessions.day, input.day),
        eq(researchSessions.slot, input.slot),
        eq(researchSessions.model, input.model),
      ),
    );
  if (dup) {
    throw new StudioError(
      `Sesi ${input.platform} ${input.day} slot ${input.slot} oleh model "${input.model}" sudah ada (${dup.id}). Cek get_research_schedule untuk slot yang belum dikerjakan.`,
    );
  }
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(researchSessions)
      .values({
        platform: input.platform,
        day: input.day,
        slot: input.slot,
        model: input.model,
        agentId: agent.id,
        notes: input.notes,
      })
      .returning();
    const rows = input.findings.length
      ? await tx
          .insert(researchFindings)
          .values(
            input.findings.map((f) => ({
              ...f,
              sessionId: session.id,
              platform: input.platform,
              verified: f.sources.length > 0,
            })),
          )
          .returning({ id: researchFindings.id })
      : [];
    return { sessionId: session.id, findingIds: rows.map((r) => r.id) };
  });
}

/** Reports for Rina's rollups and for Shion. */
export async function listResearch(input: { platform: Platform; level: "daily" | "weekly" | "monthly" | "yearly"; limit: number }) {
  return db
    .select()
    .from(researchReports)
    .where(and(eq(researchReports.platform, input.platform), eq(researchReports.level, input.level)))
    .orderBy(desc(researchReports.periodStart))
    .limit(input.limit);
}

export async function listFindings(input: { platform: Platform; day: string }) {
  return db
    .select({ finding: researchFindings, slot: researchSessions.slot, model: researchSessions.model })
    .from(researchFindings)
    .innerJoin(researchSessions, eq(researchFindings.sessionId, researchSessions.id))
    .where(and(eq(researchFindings.platform, input.platform), eq(researchSessions.day, input.day)))
    .orderBy(asc(researchSessions.slot));
}

/**
 * Publishes a research report. A daily report also opens the day's cycles for its platform
 * (docs/design.md §4.2: "riset harian Rina siap" starts the pipeline).
 */
export async function publishReport(input: {
  level: "daily" | "weekly" | "monthly" | "yearly";
  platform: Platform;
  periodStart: string;
  periodEnd: string;
  summary: string;
  opportunities: unknown[];
  findingIds: string[];
  childReportIds: string[];
}) {
  await validateReport(input);
  return db.transaction(async (tx) => {
    const [report] = await tx.insert(researchReports).values(input).returning();
    let cycleIds: string[] = [];
    if (input.level === "daily") {
      cycleIds = await openCycles(tx, input.platform, input.periodStart, report.id, CYCLES_PER_DAILY_REPORT[input.platform]);
    }
    return { reportId: report.id, openedCycles: cycleIds };
  });
}

/** Period alignment, no duplicates, and children that really belong to the period. */
async function validateReport(input: {
  level: ReportLevel;
  platform: Platform;
  periodStart: string;
  periodEnd: string;
  findingIds: string[];
  childReportIds: string[];
}) {
  const period = { start: input.periodStart, end: input.periodEnd };
  if (!isExactPeriod(input.level, period)) {
    const p = periodOf(input.level, input.periodStart);
    throw new StudioError(
      `Periode ${input.level} tidak sesuai kalender studio. Untuk tanggal ${input.periodStart} gunakan ${p.start} s/d ${p.end} (minggu = Senin-Minggu).`,
    );
  }

  const [dup] = await db
    .select({ id: researchReports.id })
    .from(researchReports)
    .where(
      and(
        eq(researchReports.platform, input.platform),
        eq(researchReports.level, input.level),
        eq(researchReports.periodStart, input.periodStart),
      ),
    );
  if (dup) throw new StudioError(`Laporan ${input.level} untuk periode ini sudah ada (${dup.id}).`);

  if (input.level === "daily") {
    const [session] = await db
      .select({ id: researchSessions.id })
      .from(researchSessions)
      .where(and(eq(researchSessions.platform, input.platform), eq(researchSessions.day, input.periodStart)))
      .limit(1);
    if (!session) throw new StudioError("Belum ada sesi riset pada hari ini; simpan sesi dulu dengan submit_research_session.");
    if (input.findingIds.length) {
      const own = await db
        .select({ id: researchFindings.id })
        .from(researchFindings)
        .innerJoin(researchSessions, eq(researchFindings.sessionId, researchSessions.id))
        .where(
          and(
            inArray(researchFindings.id, input.findingIds),
            eq(researchFindings.platform, input.platform),
            eq(researchSessions.day, input.periodStart),
          ),
        );
      if (own.length !== new Set(input.findingIds).size) {
        throw new StudioError("Sebagian finding_ids bukan temuan platform ini pada hari tersebut.");
      }
    }
    return;
  }

  const childLevel = CHILD_LEVEL[input.level as Exclude<ReportLevel, "daily">];
  if (!input.childReportIds.length) {
    throw new StudioError(`Rollup ${input.level} butuh child_report_ids (laporan ${childLevel}). Lihat get_rollup_data.`);
  }
  const kids = await db
    .select()
    .from(researchReports)
    .where(inArray(researchReports.id, input.childReportIds));
  const wrong = kids.filter(
    (k) =>
      k.platform !== input.platform ||
      k.level !== childLevel ||
      !overlaps({ start: k.periodStart, end: k.periodEnd }, period),
  );
  if (kids.length !== new Set(input.childReportIds).size || wrong.length) {
    throw new StudioError(
      `child_report_ids harus laporan ${childLevel} ${input.platform} di dalam periode ${period.start} s/d ${period.end}.`,
    );
  }
}

/** Manual cycle start (admin), e.g. to test the pipeline without a research report. */
export async function openCycleManually(platform: Platform, reportId: string | null) {
  const day = studioToday();
  return db.transaction((tx) => openCycles(tx, platform, day, reportId, 1));
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export async function reportCost(agent: Agent, input: { jobId?: string; description: string; costUsd: number }) {
  await db.transaction(async (tx) => {
    await tx.insert(usageCosts).values({ agentId: agent.id, jobId: input.jobId, description: input.description, costUsd: input.costUsd });
    if (input.jobId) {
      await tx
        .update(jobs)
        .set({ costUsd: sql`${jobs.costUsd} + ${input.costUsd}` })
        .where(eq(jobs.id, input.jobId));
    }
  });
}

export async function getIdeaGraveyard(platform: Platform, limit: number) {
  return db
    .select({ summary: ideaGraveyard.summary, reason: ideaGraveyard.reason, at: ideaGraveyard.createdAt })
    .from(ideaGraveyard)
    .where(eq(ideaGraveyard.platform, platform))
    .orderBy(desc(ideaGraveyard.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

/** Small counters for the admin sidebar: what is waiting on the human, per area. */
export async function navCounts() {
  const rows = await db
    .select({ platform: publications.platform, status: publications.status, n: sql<number>`count(*)::int` })
    .from(publications)
    .where(inArray(publications.status, ["awaiting_approval", "approved", "submitted"]))
    .groupBy(publications.platform, publications.status);
  const n = (platform: string | null, status: string) =>
    rows.filter((r) => (!platform || r.platform === platform) && r.status === status).reduce((a, r) => a + r.n, 0);
  const [{ halted }] = await db
    .select({ halted: sql<number>`count(*)::int` })
    .from(cycles)
    .where(eq(cycles.status, "halted"));
  return {
    approvals: n(null, "awaiting_approval"),
    adobe: n("adobe_stock", "approved") + n("adobe_stock", "submitted"),
    reels: n("facebook_reels", "approved"),
    halted,
  };
}

export async function dashboardSnapshot() {
  const statusCounts = await db
    .select({ status: jobs.status, platform: jobs.platform, n: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status, jobs.platform);
  const recent = await db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(25);
  const pending = await db
    .select({ pub: publications, asset: assets })
    .from(publications)
    .innerJoin(assets, eq(publications.assetId, assets.id))
    .where(eq(publications.status, "awaiting_approval"))
    .orderBy(asc(publications.createdAt));
  const halted = await db.select().from(cycles).where(eq(cycles.status, "halted")).orderBy(desc(cycles.updatedAt)).limit(10);
  const pendingWithUrls = await Promise.all(
    pending.map(async ({ pub, asset }) => ({ pub, asset, url: await presignDownload(asset.s3Key) })),
  );
  return { statusCounts, recent, pending: pendingWithUrls, halted };
}

export async function jobTimeline(jobIds: string[]) {
  if (!jobIds.length) return [];
  return db.select().from(transitions).where(inArray(transitions.jobId, jobIds)).orderBy(desc(transitions.createdAt));
}
