/** Queue, idea and idea-review stages (Shion and Lukas). */
import { and, asc, desc, eq, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { cycles, ideaGraveyard, ideas, jobs, researchReports, reviews, type AgentRole } from "@/lib/db/schema";
import { presignDownload } from "@/lib/storage";
import { ADOBE_CATEGORIES, LIMITS, PLATFORM_SPECS, REELS_CHANNEL, ROLE_QUEUES } from "../config";
import { validateStoryboard } from "../reels";
import { getRubric, scoreReview, type ReviewInput } from "../rubrics";
import { decideIdeaReview, decideStoryboardReview } from "../workflow";
import {
  StudioError,
  actorName,
  applyDecision,
  latestAsset,
  latestIdea,
  lockJob,
  moveJob,
  rubricForAsset,
  type Agent,
} from "./core";
import { blockedPlatforms } from "./automation";
import { recentPlatformRejections } from "./publishing";

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Claims the next job for a role and returns its full context, or null when the queue is empty. */
export async function claimNextJob(agent: Agent, role: Exclude<AgentRole, "admin" | "rina">) {
  if (agent.role !== role && agent.role !== "admin") {
    throw new StudioError(`Token ini untuk peran "${agent.role}", bukan "${role}"`);
  }
  // Platforms whose daily budget is used up are skipped until the next studio day.
  const blocked = await blockedPlatforms();
  const claimed = await db.transaction(async (tx) => {
    const now = new Date();
    for (const status of ROLE_QUEUES[role]) {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.status, status),
            or(isNull(jobs.claimedUntil), lt(jobs.claimedUntil, now)),
            blocked.length ? notInArray(jobs.platform, blocked) : undefined,
          ),
        )
        .orderBy(asc(jobs.updatedAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (job) {
        await tx
          .update(jobs)
          .set({ claimedBy: agent.id, claimedUntil: new Date(now.getTime() + LIMITS.claimMinutes * 60_000) })
          .where(eq(jobs.id, job.id));
        return job.id;
      }
    }
    return null;
  });
  if (!claimed && blocked.length) {
    throw new StudioError(
      `Tidak ada job yang bisa diambil. Anggaran harian habis untuk: ${blocked.join(", ")}. Berhenti dulu; antrian dibuka lagi besok (WIB) atau setelah batas dinaikkan.`,
    );
  }
  return claimed ? getJobContext(claimed) : null;
}

/** Everything an agent needs to work on a job: brief history, feedback, research, rubric, asset URL. */
export async function getJobContext(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new StudioError(`Job ${jobId} tidak ditemukan`);
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, job.cycleId));
  const report = cycle.researchReportId
    ? (await db.select().from(researchReports).where(eq(researchReports.id, cycle.researchReportId)))[0]
    : null;
  const ideaRows = await db.select().from(ideas).where(eq(ideas.jobId, jobId)).orderBy(asc(ideas.createdAt));
  const reviewRows = await db.select().from(reviews).where(eq(reviews.jobId, jobId)).orderBy(asc(reviews.createdAt));
  const asset = await latestAsset(db, jobId);
  const graveyard = await db
    .select({ summary: ideaGraveyard.summary, reason: ideaGraveyard.reason, at: ideaGraveyard.createdAt })
    .from(ideaGraveyard)
    .where(eq(ideaGraveyard.platform, job.platform))
    .orderBy(desc(ideaGraveyard.createdAt))
    .limit(30);

  const rubricId: Record<string, string | undefined> = {
    idea_review: "idea",
    storyboard_review: "storyboard",
    final_review: rubricForAsset(job),
  };

  return {
    job: {
      id: job.id,
      status: job.status,
      platform: job.platform,
      line: job.line,
      ideaNumber: job.ideaNumber,
      ideaRevisionCount: job.ideaRevisionCount,
      storyboardRevisionCount: job.storyboardRevisionCount,
      execRevisionCount: job.execRevisionCount,
      returnedFromExec: job.returnedFromExec,
    },
    limits: LIMITS,
    platformSpec: PLATFORM_SPECS[job.platform],
    adobeCategories: job.platform === "adobe_stock" ? ADOBE_CATEGORIES : undefined,
    /** Channel identity every reel must fit (Meta demonetises unoriginal mass content). */
    reelsChannel:
      job.platform === "facebook_reels"
        ? { niche: REELS_CHANNEL.niche ?? "BELUM DITETAPKAN: minta manusia mengisi STUDIO_REELS_NICHE" }
        : undefined,
    research: report
      ? { id: report.id, period: report.periodStart, summary: report.summary, opportunities: report.opportunities }
      : null,
    ideas: ideaRows.map((i) => ({ id: i.id, kind: i.kind, version: i.version, content: i.content, at: i.createdAt })),
    reviews: reviewRows.map((r) => ({
      target: r.target,
      targetId: r.targetId,
      rubric: `${r.rubricId}@${r.rubricVersion}`,
      finalScore: r.finalScore,
      passed: r.passed,
      gates: r.gates,
      scores: r.scores,
      feedback: r.feedback,
      summary: r.summary,
      diagnosis: r.diagnosis,
      at: r.createdAt,
    })),
    latestAsset: asset
      ? {
          id: asset.id,
          version: asset.version,
          contentType: asset.contentType,
          width: asset.width,
          height: asset.height,
          durationSec: asset.durationSec,
          autoCheck: asset.autoCheck,
          downloadUrl: await presignDownload(asset.s3Key),
          /** Reels: codecs, fps, loudness (LUFS) and true peak read from the file. */
          video: asset.media?.video ?? null,
          /** Reels: 3 keyframes (hook, middle, end) side by side, for reviewers that cannot play video. */
          framesUrl: asset.media?.framesKey ? await presignDownload(asset.media.framesKey) : null,
        }
      : null,
    rubric: rubricId[job.status] ? getRubric(rubricId[job.status]!) : null,
    ideaGraveyard: graveyard,
    /** Why the platform refused earlier assets; avoid repeating these problems. */
    platformRejections: await recentPlatformRejections(job.platform),
  };
}

// ---------------------------------------------------------------------------
// Shion
// ---------------------------------------------------------------------------

export async function submitIdea(agent: Agent, jobId: string, content: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["idea_pending", "idea_revision"]);
    const prev = await latestIdea(tx, jobId, "idea");
    const [row] = await tx
      .insert(ideas)
      .values({ jobId, version: (prev?.version ?? 0) + 1, kind: "idea", content, authorAgentId: agent.id })
      .returning();
    await moveJob(tx, job, "idea_review", actorName(agent), `Ide versi ${row.version} dikirim`);
    return { ideaId: row.id, version: row.version, status: "idea_review" as const };
  });
}

export async function submitStoryboard(agent: Agent, jobId: string, content: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["storyboard_pending"]);
    if (job.line !== "reel") throw new StudioError("Storyboard hanya untuk lini reels");
    const { totalSec, problems } = validateStoryboard(content);
    if (problems.length) throw new StudioError(`Storyboard belum lengkap:\n- ${problems.join("\n- ")}`);
    content = { ...content, total_duration_sec: totalSec };
    const prev = await latestIdea(tx, jobId, "storyboard");
    const [row] = await tx
      .insert(ideas)
      .values({ jobId, version: (prev?.version ?? 0) + 1, kind: "storyboard", content, authorAgentId: agent.id })
      .returning();
    await moveJob(tx, job, "storyboard_review", actorName(agent), `Storyboard versi ${row.version} dikirim`);
    return { storyboardId: row.id, version: row.version, status: "storyboard_review" as const };
  });
}

// ---------------------------------------------------------------------------
// Lukas
// ---------------------------------------------------------------------------

export async function submitIdeaReview(agent: Agent, jobId: string, input: ReviewInput & { summary: string }) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["idea_review", "storyboard_review"]);
    const kind = job.status === "idea_review" ? "idea" : "storyboard";
    const target = await latestIdea(tx, jobId, kind);
    if (!target) throw new StudioError(`Belum ada ${kind} untuk dinilai`);

    const rubric = getRubric(kind);
    const scored = scoreReview(rubric, input);

    if (kind === "idea" && scored.passed && job.returnedFromExec) {
      const [earlierPass] = await tx
        .select({ id: reviews.id })
        .from(reviews)
        .where(and(eq(reviews.targetId, target.id), eq(reviews.passed, true)))
        .limit(1);
      if (earlierPass) {
        throw new StudioError(
          "Ide ini dikembalikan dari eksekusi oleh Kechlyn. Ide versi ini sudah pernah diloloskan, jadi harus direvisi Shion dulu: kirim review tidak lolos dengan arahan revisi berdasarkan diagnosis Kechlyn.",
        );
      }
    }

    await tx.insert(reviews).values({
      jobId,
      target: kind,
      targetId: target.id,
      reviewerAgentId: agent.id,
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      gates: input.gates,
      scores: input.scores,
      feedback: input.feedback,
      summary: input.summary,
      finalScore: scored.finalScore,
      passed: scored.passed,
    });

    const decision = kind === "idea" ? decideIdeaReview(job, scored.passed) : decideStoryboardReview(job, scored.passed);
    await applyDecision(tx, job, decision, actorName(agent), kind === "idea" ? { lastIdeaScore: scored.finalScore } : {});
    return { ...scored, nextStatus: decision.status, reason: decision.reason };
  });
}
