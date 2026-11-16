/**
 * Deterministic research aggregation (docs/design.md §3.2-3.3). Rollups are computed from the
 * structured findings, not by summarising summaries; Rina only writes the interpretation.
 */

export type FindingRow = {
  topic: string;
  keywords: string[];
  demandScore: number;
  competitionScore: number;
  confidence: number;
  verified: boolean;
  seasonality: string;
  sessionId: string;
  model: string;
  day: string;
};

export type TopicAggregate = {
  key: string;
  topic: string;
  keywords: string[];
  occurrences: number;
  sessions: number;
  models: number;
  days: number;
  avgDemand: number;
  avgCompetition: number;
  avgConfidence: number;
  /** Confidence after rewarding agreement across sessions/models and capping unverified topics. */
  adjustedConfidence: number;
  verified: boolean;
  seasonality: string;
  /** 0-10: high demand, low competition, high confidence. */
  opportunityScore: number;
};

export type Trend = "new" | "up" | "down" | "stable";

/** Unverified topics (no source anywhere) never rank above this confidence. */
export const UNVERIFIED_CONFIDENCE_CAP = 5;
const TREND_THRESHOLD = 0.5;

const round2 = (x: number) => Math.round(x * 100) / 100;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function aggregateTopics(rows: FindingRow[]): TopicAggregate[] {
  const groups = new Map<string, FindingRow[]>();
  for (const r of rows) {
    const key = normalizeTopic(r.topic);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out: TopicAggregate[] = [];
  for (const [key, g] of groups) {
    const sessions = new Set(g.map((r) => r.sessionId)).size;
    const models = new Set(g.map((r) => r.model.toLowerCase())).size;
    const verified = g.some((r) => r.verified);
    const avgDemand = avg(g.map((r) => r.demandScore));
    const avgCompetition = avg(g.map((r) => r.competitionScore));
    const avgConfidence = avg(g.map((r) => r.confidence));

    let adjusted = Math.min(10, avgConfidence + 0.5 * (sessions - 1) + (models - 1));
    if (!verified) adjusted = Math.min(adjusted, UNVERIFIED_CONFIDENCE_CAP);

    const kwCounts = new Map<string, number>();
    for (const r of g) {
      for (const k of r.keywords) {
        const n = k.trim().toLowerCase();
        if (n) kwCounts.set(n, (kwCounts.get(n) ?? 0) + 1);
      }
    }

    out.push({
      key,
      topic: mostCommon(g.map((r) => r.topic.trim())),
      keywords: [...kwCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([k]) => k),
      occurrences: g.length,
      sessions,
      models,
      days: new Set(g.map((r) => r.day)).size,
      avgDemand: round2(avgDemand),
      avgCompetition: round2(avgCompetition),
      avgConfidence: round2(avgConfidence),
      adjustedConfidence: round2(adjusted),
      verified,
      seasonality: mostCommon(g.map((r) => r.seasonality.trim().toLowerCase() || "evergreen")),
      opportunityScore: round2(((avgDemand * (11 - avgCompetition)) / 10) * (adjusted / 10)),
    });
  }
  return out.sort((a, b) => b.opportunityScore - a.opportunityScore || b.occurrences - a.occurrences);
}

// ---------------------------------------------------------------------------
// Scan support (Rina-Scout → Rina)
// ---------------------------------------------------------------------------

export type ScanSignal = { scanId: string; topic: string; keywords: string[] };

/** Confidence bonus for a researched topic that the trend scout also flagged. */
export const SCAN_BONUS_FIRST = 1;
export const SCAN_BONUS_MORE = 0.5;

const opportunity = (t: Pick<TopicAggregate, "avgDemand" | "avgCompetition">, confidence: number) =>
  round2(((t.avgDemand * (11 - t.avgCompetition)) / 10) * (confidence / 10));

function supports(topic: TopicAggregate, s: ScanSignal): boolean {
  if (normalizeTopic(s.topic) === topic.key) return true;
  const mine = new Set(topic.keywords);
  return s.keywords.filter((k) => mine.has(k.trim().toLowerCase())).length >= 2;
}

/**
 * Scans are evidence, not findings: a researched topic flagged by 1 scan gets +1 confidence,
 * by 2+ scans +1.5 (still capped at 10, and at 5 when the research has no sources).
 */
export function applyScanSupport<T extends TopicAggregate>(topics: T[], signals: ScanSignal[]): (T & { scanSupport: number })[] {
  return topics
    .map((t) => {
      const scans = new Set(signals.filter((s) => supports(t, s)).map((s) => s.scanId)).size;
      if (!scans) return { ...t, scanSupport: 0 };
      let adjusted = Math.min(10, t.adjustedConfidence + SCAN_BONUS_FIRST + (scans > 1 ? SCAN_BONUS_MORE : 0));
      if (!t.verified) adjusted = Math.min(adjusted, UNVERIFIED_CONFIDENCE_CAP);
      return { ...t, scanSupport: scans, adjustedConfidence: round2(adjusted), opportunityScore: opportunity(t, adjusted) };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.occurrences - a.occurrences);
}

export type TopicWithTrend = TopicAggregate & { trend: Trend; delta: number | null };

/** Compares this period's topics with the previous period's. */
export function withTrends(current: TopicAggregate[], previous: TopicAggregate[]) {
  const prev = new Map(previous.map((t) => [t.key, t]));
  const topics: TopicWithTrend[] = current.map((t) => {
    const p = prev.get(t.key);
    if (!p) return { ...t, trend: "new", delta: null };
    const delta = round2(t.opportunityScore - p.opportunityScore);
    const trend: Trend = delta >= TREND_THRESHOLD ? "up" : delta <= -TREND_THRESHOLD ? "down" : "stable";
    return { ...t, trend, delta };
  });
  const currentKeys = new Set(current.map((t) => t.key));
  const faded = previous
    .filter((t) => !currentKeys.has(t.key))
    .slice(0, 10)
    .map((t) => ({ topic: t.topic, lastOpportunityScore: t.opportunityScore }));
  return { topics, faded };
}

export type PublicationPerf = {
  keywords: string[];
  status: string;
  downloads: number;
  revenueUsd: number;
};

/** Which keywords actually sold, and which keep getting refused by the platform. */
export function keywordPerformance(pubs: PublicationPerf[], limit = 20) {
  const map = new Map<string, { keyword: string; published: number; refused: number; downloads: number; revenueUsd: number }>();
  for (const p of pubs) {
    for (const raw of p.keywords.slice(0, 10)) {
      const k = raw.trim().toLowerCase();
      if (!k) continue;
      const e = map.get(k) ?? { keyword: k, published: 0, refused: 0, downloads: 0, revenueUsd: 0 };
      if (p.status === "published") e.published++;
      if (p.status === "platform_rejected") e.refused++;
      e.downloads += p.downloads;
      e.revenueUsd = round2(e.revenueUsd + p.revenueUsd);
      map.set(k, e);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.revenueUsd - a.revenueUsd || b.downloads - a.downloads || b.published - a.published)
    .slice(0, limit);
}
