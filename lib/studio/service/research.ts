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
import { openCycles, type Agent } from "./core";

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
  return db.transaction(async (tx) => {
    const [report] = await tx.insert(researchReports).values(input).returning();
    let cycleIds: string[] = [];
    if (input.level === "daily") {
      cycleIds = await openCycles(tx, input.platform, input.periodStart, report.id, CYCLES_PER_DAILY_REPORT[input.platform]);
    }
    return { reportId: report.id, openedCycles: cycleIds };
  });
}

/** Manual cycle start (admin), e.g. to test the pipeline without a research report. */
export async function openCycleManually(platform: Platform, reportId: string | null) {
  const day = new Date().toISOString().slice(0, 10);
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
