/**
 * Shared internals of the studio service: auth, errors, and the job/cycle state helpers
 * every stage uses. Workflow rules themselves live in ../workflow.ts.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { agents, assets, cycles, ideaGraveyard, ideas, jobs, transitions, type JobStatus, type Platform } from "@/lib/db/schema";
import { LIMITS, LINE_FOR_PLATFORM } from "../config";
import { decideCycleAfterArchive, fallbackResumeStatus, type Decision } from "../workflow";

export class StudioError extends Error {}

export type Agent = typeof agents.$inferSelect;
export type Job = typeof jobs.$inferSelect;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticate(token: string): Promise<Agent | null> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.tokenHash, hashToken(token)), eq(agents.active, true)))
    .limit(1);
  return agent ?? null;
}

export function actorName(agent: Agent | "human" | "server"): string {
  return typeof agent === "string" ? agent : `${agent.name} (${agent.role})`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export async function lockJob(tx: Tx, jobId: string, allowed: JobStatus[]): Promise<Job> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
  if (!job) throw new StudioError(`Job ${jobId} tidak ditemukan`);
  if (!allowed.includes(job.status)) {
    throw new StudioError(`Job ${jobId} berstatus "${job.status}", aksi ini hanya untuk status: ${allowed.join(", ")}`);
  }
  return job;
}

export async function moveJob(
  tx: Tx,
  job: Job,
  to: JobStatus,
  actor: string,
  reason: string,
  patch: Partial<typeof jobs.$inferInsert> = {},
): Promise<void> {
  await tx
    .update(jobs)
    .set({ ...patch, status: to, claimedBy: null, claimedUntil: null })
    .where(eq(jobs.id, job.id));
  await tx.insert(transitions).values({ jobId: job.id, fromStatus: job.status, toStatus: to, actor, reason });
}

/** Persists a workflow decision, archiving the idea and advancing the cycle when needed. */
export async function applyDecision(
  tx: Tx,
  job: Job,
  d: Decision,
  actor: string,
  extra: Partial<typeof jobs.$inferInsert> = {},
): Promise<void> {
  await moveJob(tx, job, d.status, actor, d.reason, {
    ...d.patch,
    ...extra,
    ...(d.archive ? { archiveStage: d.archive.stage, archiveReason: d.archive.reason } : {}),
  });

  if (d.archive) {
    const [latestIdea] = await tx
      .select()
      .from(ideas)
      .where(and(eq(ideas.jobId, job.id), eq(ideas.kind, "idea")))
      .orderBy(desc(ideas.version))
      .limit(1);
    const title = latestIdea?.content?.title;
    await tx.insert(ideaGraveyard).values({
      jobId: job.id,
      platform: job.platform,
      line: job.line,
      summary: typeof title === "string" ? title : JSON.stringify(latestIdea?.content ?? {}).slice(0, 500),
      reason: d.archive.reason,
    });
    await advanceCycle(tx, job.cycleId);
  }

  if (d.status === "executing" || d.status === "storyboard_pending") {
    await tx.update(cycles).set({ status: "executing" }).where(eq(cycles.id, job.cycleId));
  }
}

export async function createIdeaJob(tx: Tx, cycle: typeof cycles.$inferSelect, ideaNumber: number): Promise<void> {
  const [job] = await tx
    .insert(jobs)
    .values({ cycleId: cycle.id, platform: cycle.platform, line: cycle.line, ideaNumber })
    .returning();
  await tx.insert(transitions).values({
    jobId: job.id,
    fromStatus: null,
    toStatus: "idea_pending",
    actor: "server",
    reason: `Ide ke-${ideaNumber} dari ${LIMITS.maxIdeasPerCycle} dalam siklus`,
  });
}

export async function advanceCycle(tx: Tx, cycleId: string): Promise<void> {
  const [cycle] = await tx.select().from(cycles).where(eq(cycles.id, cycleId)).for("update");
  const cycleJobs = await tx
    .select({ id: jobs.id, status: jobs.status, archiveStage: jobs.archiveStage, lastIdeaScore: jobs.lastIdeaScore })
    .from(jobs)
    .where(eq(jobs.cycleId, cycleId));

  const d = decideCycleAfterArchive({
    ideasAttempted: cycle.ideasAttempted,
    fallbackUsed: cycle.fallbackUsed,
    jobs: cycleJobs,
  });

  if (d.action === "new_idea") {
    const next = cycle.ideasAttempted + 1;
    await tx.update(cycles).set({ ideasAttempted: next, status: "open" }).where(eq(cycles.id, cycleId));
    await createIdeaJob(tx, cycle, next);
  } else if (d.action === "fallback") {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, d.jobId)).for("update");
    await tx.update(cycles).set({ fallbackUsed: true, status: "executing" }).where(eq(cycles.id, cycleId));
    await moveJob(
      tx,
      job,
      fallbackResumeStatus(job.line),
      "server",
      `Fallback: ide terbaik dari ${LIMITS.maxIdeasPerCycle} ide (skor ${d.score}) dilanjutkan`,
      { archiveStage: null, archiveReason: null },
    );
  } else if (d.action === "halt") {
    await tx.update(cycles).set({ status: "halted", haltReason: d.reason }).where(eq(cycles.id, cycleId));
  }
}

export async function latestIdea(tx: Tx, jobId: string, kind: "idea" | "storyboard") {
  const [row] = await tx
    .select()
    .from(ideas)
    .where(and(eq(ideas.jobId, jobId), eq(ideas.kind, kind)))
    .orderBy(desc(ideas.version))
    .limit(1);
  return row ?? null;
}

export async function latestAsset(tx: Tx | typeof db, jobId: string) {
  const [row] = await tx.select().from(assets).where(eq(assets.jobId, jobId)).orderBy(desc(assets.version)).limit(1);
  return row ?? null;
}

export function rubricForAsset(job: Job): string {
  return job.line === "image" ? "asset-image" : "asset-reel";
}


export async function openCycles(tx: Tx, platform: Platform, day: string, reportId: string | null, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [cycle] = await tx
      .insert(cycles)
      .values({ platform, line: LINE_FOR_PLATFORM[platform], day, researchReportId: reportId, ideasAttempted: 1 })
      .returning();
    await createIdeaJob(tx, cycle, 1);
    ids.push(cycle.id);
  }
  return ids;
}
