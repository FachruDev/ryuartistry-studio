/** Execution, final review, publication prep and human approval (Linda, Kechlyn, dashboard). */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, cycles, jobs, publications, reviews, type FailureDiagnosis } from "@/lib/db/schema";
import { assetKey, headObject, presignUpload } from "@/lib/storage";
import { runAutoCheck } from "../auto-check";
import { PLATFORM_SPECS } from "../config";
import { getRubric, scoreReview, type ReviewInput } from "../rubrics";
import { decideApproval, decideAutoCheck, decideFinalReview } from "../workflow";
import { StudioError, actorName, applyDecision, latestAsset, lockJob, moveJob, rubricForAsset, type Agent } from "./core";

// Linda
// ---------------------------------------------------------------------------

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4" };

export async function createAssetUpload(agent: Agent, jobId: string, contentType: string) {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new StudioError(`Content type tidak didukung: ${contentType}`);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || !["executing", "exec_revision"].includes(job.status)) {
    throw new StudioError("Upload hanya bisa untuk job berstatus executing atau exec_revision");
  }
  const prev = await latestAsset(db, jobId);
  const version = (prev?.version ?? 0) + 1;
  const key = assetKey(jobId, version, ext);
  return {
    s3Key: key,
    version,
    uploadUrl: await presignUpload(key, contentType),
    method: "PUT",
    headers: { "Content-Type": contentType },
    expiresInSeconds: 3600,
  };
}

export async function submitAsset(
  agent: Agent,
  jobId: string,
  input: {
    s3Key: string;
    contentType: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    notes?: string;
  },
) {
  if (!input.s3Key.startsWith(`studio/jobs/${jobId}/`)) throw new StudioError("s3Key bukan milik job ini");
  const head = await headObject(input.s3Key);
  if (!head) throw new StudioError("File belum ada di storage. Upload dulu ke uploadUrl dari create_asset_upload.");

  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["executing", "exec_revision"]);
    const prev = await latestAsset(tx, jobId);
    const check = runAutoCheck(job.platform, {
      contentType: input.contentType,
      bytes: head.bytes,
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
    });
    const [asset] = await tx
      .insert(assets)
      .values({
        jobId,
        version: (prev?.version ?? 0) + 1,
        s3Key: input.s3Key,
        contentType: input.contentType,
        bytes: head.bytes,
        width: input.width,
        height: input.height,
        durationSec: input.durationSec,
        autoCheck: check,
        notes: input.notes,
      })
      .returning();

    await moveJob(tx, job, "auto_check", actorName(agent), `Aset versi ${asset.version} dikirim`);
    const checking = { ...job, status: "auto_check" as const };
    const decision = decideAutoCheck(job, check.passed);
    await applyDecision(
      tx,
      checking,
      { ...decision, reason: check.passed ? decision.reason : `${decision.reason}: ${check.problems.join("; ")}` },
      "server",
    );
    return { assetId: asset.id, version: asset.version, autoCheck: check, nextStatus: decision.status };
  });
}

// ---------------------------------------------------------------------------
// Kechlyn
// ---------------------------------------------------------------------------

export async function submitAssetReview(
  agent: Agent,
  jobId: string,
  input: ReviewInput & { summary: string; diagnosis: FailureDiagnosis | null },
) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["final_review"]);
    const asset = await latestAsset(tx, jobId);
    if (!asset) throw new StudioError("Belum ada aset untuk dinilai");
    const rubric = getRubric(rubricForAsset(job));
    const scored = scoreReview(rubric, input);
    if (!scored.passed && !input.diagnosis) {
      throw new StudioError(
        `Aset tidak lolos (skor ${scored.finalScore}). Wajib isi diagnosis: execution, infeasible, atau weak_idea.`,
      );
    }
    await tx.insert(reviews).values({
      jobId,
      target: "asset",
      targetId: asset.id,
      reviewerAgentId: agent.id,
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      gates: input.gates,
      scores: input.scores,
      feedback: input.feedback,
      summary: input.summary,
      finalScore: scored.finalScore,
      passed: scored.passed,
      diagnosis: scored.passed ? null : input.diagnosis,
    });
    const decision = decideFinalReview(job, scored.passed, scored.passed ? null : input.diagnosis);
    await applyDecision(tx, job, decision, actorName(agent));
    return { ...scored, nextStatus: decision.status, reason: decision.reason };
  });
}

export async function submitPublicationPrep(
  agent: Agent,
  jobId: string,
  input: {
    title: string;
    caption?: string;
    keywords: string[];
    hashtags: string[];
    category?: string;
    aiLabel: boolean;
    scheduledFor?: string;
  },
) {
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["publish_prep"]);
    const problems: string[] = [];
    if (!input.aiLabel) problems.push("Label AI wajib true untuk konten buatan AI");
    if (job.platform === "adobe_stock") {
      const max = PLATFORM_SPECS.adobe_stock.maxKeywords;
      if (input.keywords.length === 0) problems.push("Keyword wajib diisi untuk Adobe Stock");
      if (input.keywords.length > max) problems.push(`Keyword maksimal ${max}, terkirim ${input.keywords.length}`);
    } else if (!input.caption?.trim()) {
      problems.push("Caption wajib diisi untuk reels");
    }
    if (problems.length) throw new StudioError(`Metadata tidak valid:\n- ${problems.join("\n- ")}`);

    const asset = await latestAsset(tx, jobId);
    if (!asset) throw new StudioError("Job tidak punya aset");
    const [pub] = await tx
      .insert(publications)
      .values({
        jobId,
        assetId: asset.id,
        platform: job.platform,
        title: input.title,
        caption: input.caption,
        keywords: input.keywords,
        hashtags: input.hashtags,
        category: input.category,
        aiLabel: input.aiLabel,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      })
      .returning();
    await moveJob(tx, job, "awaiting_approval", actorName(agent), "Metadata publikasi siap, menunggu approval manusia");
    return { publicationId: pub.id, nextStatus: "awaiting_approval" as const };
  });
}

// ---------------------------------------------------------------------------
// Human approval (dashboard)
// ---------------------------------------------------------------------------

export async function decidePublication(publicationId: string, approved: boolean, note?: string) {
  return db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.status !== "awaiting_approval") throw new StudioError("Publikasi tidak menunggu approval");
    const job = await lockJob(tx, pub.jobId, ["awaiting_approval"]);
    await tx
      .update(publications)
      .set({
        status: approved ? "approved" : "rejected",
        reviewerNote: note ?? null,
        approvedAt: approved ? new Date() : null,
      })
      .where(eq(publications.id, publicationId));
    const d = decideApproval(approved);
    await moveJob(tx, job, d.status, "human", note ? `${d.reason}: ${note}` : d.reason);
    if (approved) await tx.update(cycles).set({ status: "done" }).where(eq(cycles.id, job.cycleId));
  });
}
