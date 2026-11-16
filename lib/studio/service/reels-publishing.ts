/**
 * Facebook Reels posting kit. Posting goes through Meta's own tools (Meta Business Suite / the
 * Facebook app), so the studio prepares the file and caption, then records the post link.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, ideaGraveyard, ideas, publications } from "@/lib/db/schema";
import { presignDownload } from "@/lib/storage";
import { StudioError, lockJob, moveJob } from "./core";

/** Approved reels waiting to be posted, with a download named after the publication. */
export async function reelsPostingKit() {
  const rows = await db
    .select({ pub: publications, s3Key: assets.s3Key, durationSec: assets.durationSec, media: assets.media })
    .from(publications)
    .innerJoin(assets, eq(publications.assetId, assets.id))
    .where(and(eq(publications.platform, "facebook_reels"), eq(publications.status, "approved")))
    .orderBy(publications.approvedAt);
  return Promise.all(
    rows.map(async (r) => ({
      pub: r.pub,
      durationSec: r.durationSec,
      downloadUrl: await presignDownload(r.s3Key, 3600, r.pub.fileName ?? undefined),
      framesUrl: r.media?.framesKey ? await presignDownload(r.media.framesKey) : null,
      /** Caption and hashtags ready to paste in one go. */
      postText: [r.pub.caption ?? "", r.pub.hashtags.join(" ")].filter(Boolean).join("\n\n"),
    })),
  );
}

export async function postedReels(limit = 20) {
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.platform, "facebook_reels"), eq(publications.status, "published")))
    .orderBy(desc(publications.publishedAt))
    .limit(limit);
}

function postIdFrom(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new StudioError("Link postingan tidak valid. Tempel URL lengkap reel dari Facebook (https://…).");
  }
  if (!/(^|\.)facebook\.com$|(^|\.)fb\.watch$/.test(u.hostname)) {
    throw new StudioError("Link harus dari facebook.com atau fb.watch.");
  }
  return u.toString();
}

/** The human posted the reel on Facebook: record the link and mark it published. */
export async function markReelPosted(publicationId: string, postUrl: string) {
  const externalId = postIdFrom(postUrl);
  return db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.platform !== "facebook_reels" || pub.status !== "approved") {
      throw new StudioError("Reel ini belum disetujui atau sudah ditandai terposting");
    }
    const job = await lockJob(tx, pub.jobId, ["scheduled"]);
    await tx
      .update(publications)
      .set({ status: "published", externalId, publishedAt: new Date(), submittedAt: new Date() })
      .where(eq(publications.id, publicationId));
    await moveJob(tx, job, "published", "human", `Diposting ke Facebook: ${externalId}`);
  });
}

/**
 * Meta removed the reel, limited it, or refused monetisation. The job is archived and the
 * reason goes to the idea graveyard and every agent's platformRejections.
 */
export async function recordReelRestriction(publicationId: string, reason: string) {
  if (!reason.trim()) throw new StudioError("Tulis alasan dari Meta (mis. 'konten tidak orisinal', 'musik berhak cipta')");
  return db.transaction(async (tx) => {
    const [pub] = await tx.select().from(publications).where(eq(publications.id, publicationId)).for("update");
    if (!pub || pub.platform !== "facebook_reels" || pub.status !== "published") {
      throw new StudioError("Hanya reel yang sudah terposting yang bisa ditandai dibatasi Meta");
    }
    const job = await lockJob(tx, pub.jobId, ["published"]);
    const note = `Dibatasi Meta: ${reason.trim()}`;
    await tx.update(publications).set({ status: "platform_rejected", platformNote: reason.trim() }).where(eq(publications.id, publicationId));
    await moveJob(tx, job, "archived", "human", note, { archiveStage: "platform", archiveReason: note });
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
      reason: note,
    });
  });
}
