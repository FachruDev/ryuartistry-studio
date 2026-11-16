/** Execution and final review (Linda, Kechlyn). */
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, jobs, reviews, type FailureDiagnosis, type Platform } from "@/lib/db/schema";
import { assetKey, getObjectBytes, headObject, presignUpload } from "@/lib/storage";
import { runAutoCheck } from "../auto-check";
import { PLATFORM_SPECS } from "../config";
import { hammingDistance, inspectImage, type ImageFacts } from "../image-inspect";
import { getRubric, scoreReview, type ReviewInput } from "../rubrics";
import { decideAutoCheck, decideFinalReview } from "../workflow";
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

  const [current] = await db.select({ platform: jobs.platform }).from(jobs).where(eq(jobs.id, jobId));
  if (!current) throw new StudioError(`Job ${jobId} tidak ditemukan`);

  // Image facts come from the file itself, read before the transaction (network + decode).
  let image: ImageFacts | undefined;
  let nearestDuplicate: { assetId: string; distance: number } | null = null;
  if (current.platform === "adobe_stock" && head.bytes <= PLATFORM_SPECS.adobe_stock.maxBytes) {
    image = await inspectImage(await getObjectBytes(input.s3Key));
    if (image.dhash) nearestDuplicate = await findNearestDuplicate(current.platform, jobId, image.dhash);
  }

  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["executing", "exec_revision"]);
    const prev = await latestAsset(tx, jobId);
    const check = runAutoCheck(job.platform, {
      contentType: input.contentType,
      bytes: head.bytes,
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
      image,
      nearestDuplicate,
    });
    const [asset] = await tx
      .insert(assets)
      .values({
        jobId,
        version: (prev?.version ?? 0) + 1,
        s3Key: input.s3Key,
        contentType: input.contentType,
        bytes: head.bytes,
        width: image?.width ?? input.width,
        height: image?.height ?? input.height,
        durationSec: input.durationSec,
        phash: image?.dhash ?? null,
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

/**
 * Closest earlier asset on the same platform from other jobs, by dHash distance.
 * Linear scan: fine for thousands of assets; move to a bit-index if the library grows large.
 */
async function findNearestDuplicate(platform: Platform, jobId: string, dhash: string) {
  const rows = await db
    .select({ id: assets.id, phash: assets.phash })
    .from(assets)
    .innerJoin(jobs, eq(assets.jobId, jobs.id))
    .where(and(eq(jobs.platform, platform), ne(assets.jobId, jobId), isNotNull(assets.phash)));
  let best: { assetId: string; distance: number } | null = null;
  for (const r of rows) {
    const distance = hammingDistance(dhash, r.phash!);
    if (!best || distance < best.distance) best = { assetId: r.id, distance };
  }
  return best;
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
