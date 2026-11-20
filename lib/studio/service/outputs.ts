/**
 * What each agent produced, as one feed for the "Hasil kerja" page. Every row type is owned by
 * exactly one role (scans → Rina-Scout, research → Rina, ideas → Shion, idea reviews → Lukas,
 * assets → Linda, asset reviews + publication prep → Kechlyn), so filtering by agent is a
 * filter by row type, and works even when work was submitted with an admin token.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  ideas,
  jobs,
  publications,
  researchFindings,
  researchReports,
  researchSessions,
  reviews,
  type Platform,
} from "@/lib/db/schema";
import { trendScans } from "@/lib/db/schema-scout";
import { presignDownload } from "@/lib/storage";

export const OUTPUT_ROLES = ["rina_scout", "rina", "shion", "lukas", "linda", "kechlyn"] as const;
export type OutputRole = (typeof OUTPUT_ROLES)[number];

export type OutputKind =
  | "trend_scan"
  | "research_session"
  | "report"
  | "idea"
  | "storyboard"
  | "idea_review"
  | "asset"
  | "asset_review"
  | "publication";

export type OutputItem = {
  id: string;
  kind: OutputKind;
  role: OutputRole;
  at: Date;
  platform: Platform;
  title: string;
  /** One or two lines shown in the card. */
  summary: string;
  /** Extra lines shown when the card is expanded. */
  details: string[];
  jobId: string | null;
  score: number | null;
  passed: boolean | null;
  /** Image preview / file link for assets. */
  fileUrl: string | null;
  isImage: boolean;
};

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

export function parseOutputRoles(v: unknown): OutputRole[] {
  const raw = (Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : "").split(",");
  const roles = raw.map((r) => r.trim()).filter((r): r is OutputRole => (OUTPUT_ROLES as readonly string[]).includes(r));
  return roles.length ? [...new Set(roles)] : [...OUTPUT_ROLES];
}

/** Agent outputs since `since`, newest first, limited per role so one busy agent cannot hide the rest. */
export async function listAgentOutputs(opts: { roles: OutputRole[]; days: number; platform?: Platform; perRole?: number; now?: Date }) {
  const { roles, days, platform, perRole = 60, now = new Date() } = opts;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const want = (r: OutputRole) => roles.includes(r);
  const items: OutputItem[] = [];

  if (want("rina_scout")) {
    const rows = await db
      .select()
      .from(trendScans)
      .where(and(gte(trendScans.createdAt, since), platform ? eq(trendScans.platform, platform) : undefined))
      .orderBy(desc(trendScans.createdAt))
      .limit(perRole);
    for (const s of rows) {
      const top = [...s.signals].sort((a, b) => b.momentum - a.momentum);
      items.push({
        id: s.id, kind: "trend_scan", role: "rina_scout", at: s.createdAt, platform: s.platform,
        title: `Pindaian slot ${s.slot} · ${s.signals.length} sinyal`,
        summary: top.slice(0, 4).map((x) => x.topic).join(" · "),
        details: top.map((x) => `↑${x.momentum} ${x.topic}: ${clip(x.why, 160)}`),
        jobId: null, score: null, passed: null, fileUrl: null, isImage: false,
      });
    }
  }

  if (want("rina")) {
    const sessions = await db
      .select()
      .from(researchSessions)
      .where(and(gte(researchSessions.createdAt, since), platform ? eq(researchSessions.platform, platform) : undefined))
      .orderBy(desc(researchSessions.createdAt))
      .limit(perRole);
    const findings = sessions.length
      ? await db
          .select({ sessionId: researchFindings.sessionId, topic: researchFindings.topic, demand: researchFindings.demandScore, competition: researchFindings.competitionScore, verified: researchFindings.verified })
          .from(researchFindings)
          .where(inArray(researchFindings.sessionId, sessions.map((s) => s.id)))
      : [];
    for (const s of sessions) {
      const mine = findings.filter((f) => f.sessionId === s.id);
      items.push({
        id: s.id, kind: "research_session", role: "rina", at: s.createdAt, platform: s.platform,
        title: `Riset ${s.day} slot ${s.slot} · ${mine.length} temuan`,
        summary: mine.slice(0, 4).map((f) => f.topic).join(" · ") || (s.notes ?? ""),
        details: mine.map((f) => `${f.topic} — permintaan ${f.demand}, persaingan ${f.competition}${f.verified ? "" : " (tanpa sumber)"}`),
        jobId: null, score: null, passed: null, fileUrl: null, isImage: false,
      });
    }
    const reports = await db
      .select()
      .from(researchReports)
      .where(and(gte(researchReports.createdAt, since), platform ? eq(researchReports.platform, platform) : undefined))
      .orderBy(desc(researchReports.createdAt))
      .limit(perRole);
    for (const r of reports) {
      const opps = r.opportunities as { topic?: string; priority?: number }[];
      items.push({
        id: r.id, kind: "report", role: "rina", at: r.createdAt, platform: r.platform,
        title: `Laporan ${r.level} ${r.periodStart === r.periodEnd ? r.periodStart : `${r.periodStart} – ${r.periodEnd}`}`,
        summary: clip(r.summary),
        details: [r.summary, ...opps.map((o) => `P${o.priority ?? "?"} ${o.topic ?? ""}`)],
        jobId: null, score: null, passed: null, fileUrl: null, isImage: false,
      });
    }
  }

  // Job-bound outputs: join jobs for the platform filter.
  const jobPlatform = platform ? eq(jobs.platform, platform) : undefined;

  if (want("shion")) {
    const rows = await db
      .select({ idea: ideas, platform: jobs.platform })
      .from(ideas)
      .innerJoin(jobs, eq(ideas.jobId, jobs.id))
      .where(and(gte(ideas.createdAt, since), jobPlatform))
      .orderBy(desc(ideas.createdAt))
      .limit(perRole);
    for (const { idea, platform: p } of rows) {
      const c = idea.content;
      const isSb = idea.kind === "storyboard";
      const scenes = Array.isArray(c.scenes) ? (c.scenes as { duration_sec?: number; visual?: unknown }[]) : [];
      items.push({
        id: idea.id, kind: isSb ? "storyboard" : "idea", role: "shion", at: idea.createdAt, platform: p,
        title: `${isSb ? "Storyboard" : "Ide"} v${idea.version}: ${str(c.title) || str(c.hook).slice(0, 80) || "tanpa judul"}`,
        summary: clip(isSb ? `Hook: ${str(c.hook)} · ${scenes.length} scene, ${scenes.reduce((a, s) => a + (s.duration_sec ?? 0), 0)} detik` : str(c.concept) || str(c.buyer_use)),
        details: isSb
          ? scenes.map((s, i) => `Scene ${i + 1} (${s.duration_sec ?? "?"} dtk): ${clip(str(s.visual), 160)}`)
          : Object.entries(c).filter(([k]) => k !== "title").map(([k, v]) => `${k}: ${clip(str(v), 240)}`),
        jobId: idea.jobId, score: null, passed: null, fileUrl: null, isImage: false,
      });
    }
  }

  if (want("lukas") || want("kechlyn")) {
    const targets = [...(want("lukas") ? (["idea", "storyboard"] as const) : []), ...(want("kechlyn") ? (["asset"] as const) : [])];
    const rows = await db
      .select({ review: reviews, platform: jobs.platform })
      .from(reviews)
      .innerJoin(jobs, eq(reviews.jobId, jobs.id))
      .where(and(gte(reviews.createdAt, since), inArray(reviews.target, targets), jobPlatform))
      .orderBy(desc(reviews.createdAt))
      .limit(perRole * targets.length);
    for (const { review: r, platform: p } of rows) {
      const isAsset = r.target === "asset";
      items.push({
        id: r.id, kind: isAsset ? "asset_review" : "idea_review", role: isAsset ? "kechlyn" : "lukas", at: r.createdAt, platform: p,
        title: `Review ${r.target === "asset" ? "aset" : r.target === "storyboard" ? "storyboard" : "ide"}: ${r.passed ? "lolos" : "tidak lolos"}${r.diagnosis ? ` (${r.diagnosis})` : ""}`,
        summary: clip(r.summary),
        details: [
          ...Object.entries(r.scores).map(([k, v]) => `${k}: ${v}/10${r.feedback[k] ? ` — ${clip(r.feedback[k], 200)}` : ""}`),
          ...Object.entries(r.gates).filter(([, ok]) => !ok).map(([k]) => `Gate gagal: ${k}${r.feedback[k] ? ` — ${clip(r.feedback[k], 200)}` : ""}`),
        ],
        jobId: r.jobId, score: r.finalScore, passed: r.passed, fileUrl: null, isImage: false,
      });
    }
  }

  if (want("linda")) {
    const rows = await db
      .select({ asset: assets, platform: jobs.platform })
      .from(assets)
      .innerJoin(jobs, eq(assets.jobId, jobs.id))
      .where(and(gte(assets.createdAt, since), jobPlatform))
      .orderBy(desc(assets.createdAt))
      .limit(perRole);
    for (const { asset: a, platform: p } of rows) {
      const isImage = a.contentType.startsWith("image/");
      items.push({
        id: a.id, kind: "asset", role: "linda", at: a.createdAt, platform: p,
        title: `Aset v${a.version} · ${isImage ? "gambar" : "video"}${a.width && a.height ? ` ${a.width}×${a.height}` : ""}${a.durationSec ? ` · ${Math.round(a.durationSec)} dtk` : ""}`,
        summary: a.autoCheck ? (a.autoCheck.passed ? "Lolos cek teknis" : `Gagal cek teknis: ${a.autoCheck.problems.join("; ")}`) : "Menunggu cek teknis",
        details: [a.notes ?? ""].filter(Boolean).map((n) => clip(n, 600)),
        jobId: a.jobId, score: null, passed: a.autoCheck?.passed ?? null,
        fileUrl: await presignDownload(a.s3Key, 3600).catch(() => null),
        isImage,
      });
    }
  }

  if (want("kechlyn")) {
    const rows = await db
      .select()
      .from(publications)
      .where(and(gte(publications.createdAt, since), platform ? eq(publications.platform, platform) : undefined))
      .orderBy(desc(publications.createdAt))
      .limit(perRole);
    for (const pub of rows) {
      items.push({
        id: pub.id, kind: "publication", role: "kechlyn", at: pub.createdAt, platform: pub.platform,
        title: `Metadata: ${pub.title}`,
        summary: clip(pub.caption || pub.keywords.slice(0, 10).join(", ")),
        details: [
          `Status: ${pub.status}`,
          pub.keywords.length ? `Keyword (${pub.keywords.length}): ${pub.keywords.join(", ")}` : "",
          pub.hashtags.length ? `Hashtag: ${pub.hashtags.join(" ")}` : "",
          pub.category ? `Kategori: ${pub.category}` : "",
        ].filter(Boolean),
        jobId: pub.jobId, score: pub.agentScore, passed: null, fileUrl: null, isImage: false,
      });
    }
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Per-role totals for the summary tiles. */
export function summarizeOutputs(items: OutputItem[], roles: OutputRole[]) {
  return roles.map((role) => {
    const mine = items.filter((i) => i.role === role);
    const judged = mine.filter((i) => i.passed != null);
    return {
      role,
      count: mine.length,
      lastAt: mine[0]?.at ?? null,
      passRate: judged.length ? judged.filter((i) => i.passed).length / judged.length : null,
    };
  });
}
