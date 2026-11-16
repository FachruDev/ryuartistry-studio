/**
 * Publication stages: Kechlyn's metadata prep, human approval, the manual Adobe upload kit,
 * Adobe's own verdict, and the numbers used to calibrate the rubric (docs/design.md §8-§10).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, cycles, ideaGraveyard, ideas, publications, reviews, type Platform } from "@/lib/db/schema";
import { presignDownload } from "@/lib/storage";
import { adobeFileName, buildAdobeCsv, validateAdobeMetadata } from "../adobe";
import { assetFileName, validateReelMetadata } from "../reels";
import { autoPublishDecision } from "../automation";
import { ADOBE_CATEGORIES, AUTO_MODE_CRITERIA } from "../config";
import { decideApproval } from "../workflow";
import { StudioError, actorName, latestAsset, lockJob, moveJob, type Agent } from "./core";

// ---------------------------------------------------------------------------
// Kechlyn: metadata
// ---------------------------------------------------------------------------

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
  const result = await db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId, ["publish_prep"]);
    if (!input.aiLabel) throw new StudioError("Label AI wajib true untuk konten buatan AI");

    const id = randomUUID();
    let meta = { title: input.title.trim(), keywords: input.keywords, category: input.category ?? null };
    let caption = input.caption;
    let hashtags = input.hashtags;
    let fileName: string | null = null;
    try {
      if (job.platform === "adobe_stock") {
        const valid = validateAdobeMetadata(input);
        meta = { ...valid, category: String(valid.category) };
        fileName = adobeFileName(meta.title, id);
      } else {
        const valid = validateReelMetadata(input);
        meta = { ...meta, title: valid.title };
        caption = valid.caption;
        hashtags = valid.hashtags;
        fileName = assetFileName(valid.title, id, "mp4");
      }
    } catch (e) {
      throw new StudioError((e as Error).message);
    }

    const asset = await latestAsset(tx, jobId);
    if (!asset) throw new StudioError("Job tidak punya aset");
    const [passing] = await tx
      .select({ score: reviews.finalScore })
      .from(reviews)
      .where(and(eq(reviews.targetId, asset.id), eq(reviews.passed, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(1);

    await tx.insert(publications).values({
      id,
      jobId,
      assetId: asset.id,
      platform: job.platform,
      title: meta.title,
      caption,
      keywords: meta.keywords,
      hashtags,
      category: meta.category,
      fileName,
      aiLabel: input.aiLabel,
      agentScore: passing?.score ?? null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    });
    await moveJob(tx, job, "awaiting_approval", actorName(agent), "Metadata publikasi siap, menunggu approval manusia");
    return { publicationId: id, platform: job.platform, fileName, keywords: meta.keywords, hashtags };
  });
  const auto = await maybeAutoApprove(result.publicationId, result.platform);
  return { ...result, nextStatus: auto.auto ? ("scheduled" as const) : ("awaiting_approval" as const), autoPublish: auto };
}

/**
 * Auto-publish (Phase 4): skips the human only when the operator switched it on AND the
 * platform's calibration criteria hold right now. Loaded lazily to avoid an import cycle.
 */
async function maybeAutoApprove(publicationId: string, platform: Platform) {
  const { getAutomationSettings } = await import("./automation");
  const decision = autoPublishDecision(await getAutomationSettings(), platform, (await calibrationStats(platform)).readyForAutoMode);
  if (!decision.auto) return decision;
  await db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.status !== "awaiting_approval") return;
    const job = await lockJob(tx, pub.jobId, ["awaiting_approval"]);
    await tx
      .update(publications)
      .set({ status: "approved", autoApproved: true, approvedAt: new Date(), reviewerNote: decision.reason })
      .where(eq(publications.id, publicationId));
    await moveJob(tx, job, "scheduled", "server", decision.reason);
    await tx.update(cycles).set({ status: "done" }).where(eq(cycles.id, job.cycleId));
  });
  return decision;
}

// ---------------------------------------------------------------------------
// Human approval
// ---------------------------------------------------------------------------

export async function decidePublication(publicationId: string, approved: boolean, humanScore: number, note?: string) {
  if (!Number.isInteger(humanScore) || humanScore < 1 || humanScore > 10) {
    throw new StudioError("Skor manusia wajib 1-10");
  }
  return db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.status !== "awaiting_approval") throw new StudioError("Publikasi tidak menunggu approval");
    const job = await lockJob(tx, pub.jobId, ["awaiting_approval"]);
    await tx
      .update(publications)
      .set({
        status: approved ? "approved" : "rejected",
        reviewerNote: note ?? null,
        humanScore,
        approvedAt: approved ? new Date() : null,
      })
      .where(eq(publications.id, publicationId));
    const d = decideApproval(approved);
    await moveJob(tx, job, d.status, "human", note ? `${d.reason} (skor ${humanScore}): ${note}` : d.reason);
    if (approved) await tx.update(cycles).set({ status: "done" }).where(eq(cycles.id, job.cycleId));
  });
}

// ---------------------------------------------------------------------------
// Adobe upload kit
// ---------------------------------------------------------------------------

/** Approved Adobe items waiting to be uploaded, with download links named as the CSV expects. */
export async function adobeUploadKit() {
  const rows = await db
    .select({ pub: publications, s3Key: assets.s3Key, width: assets.width, height: assets.height })
    .from(publications)
    .innerJoin(assets, eq(publications.assetId, assets.id))
    .where(and(eq(publications.platform, "adobe_stock"), eq(publications.status, "approved")))
    .orderBy(publications.approvedAt);
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      categoryName: ADOBE_CATEGORIES[Number(r.pub.category)] ?? null,
      downloadUrl: await presignDownload(r.s3Key, 3600, r.pub.fileName ?? undefined),
    })),
  );
}

export async function adobeKitCsv(): Promise<string> {
  const rows = await db
    .select()
    .from(publications)
    .where(and(eq(publications.platform, "adobe_stock"), eq(publications.status, "approved")))
    .orderBy(publications.approvedAt);
  return buildAdobeCsv(
    rows.map((p) => ({ fileName: p.fileName ?? "", title: p.title, keywords: p.keywords, category: p.category })),
  );
}

/** The human uploaded these files and the CSV to Adobe; Adobe's review is now pending. */
export async function markSubmitted(publicationIds: string[]) {
  if (!publicationIds.length) return;
  await db
    .update(publications)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(and(inArray(publications.id, publicationIds), eq(publications.status, "approved")));
}

export async function submittedAwaitingResult(platform: Platform) {
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.platform, platform), eq(publications.status, "submitted")))
    .orderBy(publications.submittedAt);
}

/**
 * Records the platform's verdict. A refusal archives the job and goes to the idea graveyard,
 * so Shion, Lukas and Kechlyn see why the platform said no.
 */
export async function recordPlatformResult(
  publicationId: string,
  accepted: boolean,
  note?: string,
  externalId?: string,
) {
  if (!accepted && !note?.trim()) throw new StudioError("Alasan penolakan platform wajib diisi");
  return db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.status !== "submitted") throw new StudioError("Publikasi belum ditandai sudah diupload");
    const job = await lockJob(tx, pub.jobId, ["scheduled"]);
    await tx
      .update(publications)
      .set({
        status: accepted ? "published" : "platform_rejected",
        platformNote: note ?? null,
        externalId: externalId ?? null,
        publishedAt: accepted ? new Date() : null,
      })
      .where(eq(publications.id, publicationId));

    if (accepted) {
      await moveJob(tx, job, "published", "human", "Diterima platform");
      return;
    }
    const reason = `Ditolak ${pub.platform === "adobe_stock" ? "Adobe Stock" : "platform"}: ${note}`;
    await moveJob(tx, job, "archived", "human", reason, { archiveStage: "platform", archiveReason: reason });
    const [idea] = await tx
      .select({ content: ideas.content })
      .from(ideas)
      .where(and(eq(ideas.jobId, job.id), eq(ideas.kind, "idea")))
      .orderBy(desc(ideas.version))
      .limit(1);
    const title = idea?.content?.title;
    await tx.insert(ideaGraveyard).values({
      jobId: job.id,
      platform: job.platform,
      line: job.line,
      summary: typeof title === "string" ? title : pub.title,
      reason,
    });
  });
}

/** Latest platform refusals, shown to reviewers so the rubric catches the same problem next time. */
export async function recentPlatformRejections(platform: Platform, limit = 15) {
  return db
    .select({ title: publications.title, reason: publications.platformNote, at: publications.updatedAt })
    .from(publications)
    .where(and(eq(publications.platform, platform), eq(publications.status, "platform_rejected")))
    .orderBy(desc(publications.updatedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Rubric calibration
// ---------------------------------------------------------------------------

const HUMAN_REVIEWED = ["approved", "rejected", "submitted", "published", "platform_rejected"] as const;

export async function calibrationStats(platform: Platform) {
  const rows = await db
    .select({ status: publications.status, human: publications.humanScore, agent: publications.agentScore, auto: publications.autoApproved })
    .from(publications)
    .where(and(eq(publications.platform, platform), inArray(publications.status, [...HUMAN_REVIEWED])));

  // Human statistics only count items a human actually decided.
  const human = rows.filter((r) => !r.auto);
  const reviewed = human.length;
  const rejectedByHuman = human.filter((r) => r.status === "rejected").length;
  const approvalRate = reviewed ? (reviewed - rejectedByHuman) / reviewed : null;

  const pairs = rows.filter((r) => r.human != null && r.agent != null);
  const diffs = pairs.map((r) => r.agent! - r.human!);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const accepted = rows.filter((r) => r.status === "published").length;
  const refused = rows.filter((r) => r.status === "platform_rejected").length;
  const acceptanceRate = accepted + refused ? accepted / (accepted + refused) : null;

  const c = AUTO_MODE_CRITERIA;
  return {
    reviewed,
    approvalRate,
    scoredPairs: pairs.length,
    /** average |Kechlyn - human| */
    meanAbsDiff: mean(diffs.map(Math.abs)),
    /** > 0 means Kechlyn scores higher than the human (too generous) */
    meanBias: mean(diffs),
    platformDecided: accepted + refused,
    acceptanceRate,
    criteria: c,
    readyForAutoMode:
      reviewed >= c.minHumanReviewed &&
      (approvalRate ?? 0) >= c.minHumanApprovalRate &&
      (acceptanceRate ?? 0) >= c.minPlatformAcceptanceRate,
  };
}
