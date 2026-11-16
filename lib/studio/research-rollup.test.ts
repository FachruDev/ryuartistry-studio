import { describe, expect, test } from "bun:test";
import { addDays, currentSlot, isExactPeriod, periodOf, previousPeriod, studioToday } from "./research-periods";
import { aggregateTopics, applyScanSupport, keywordPerformance, normalizeTopic, withTrends, type FindingRow } from "./research-rollup";

const f = (over: Partial<FindingRow>): FindingRow => ({
  topic: "Paper texture",
  keywords: ["paper", "texture"],
  demandScore: 8,
  competitionScore: 3,
  confidence: 6,
  verified: true,
  seasonality: "evergreen",
  sessionId: "s1",
  model: "claude",
  day: "2026-11-16",
  ...over,
});

describe("periods", () => {
  test("weeks run Monday to Sunday", () => {
    // 2026-11-16 is a Monday
    expect(periodOf("weekly", "2026-11-18")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(periodOf("weekly", "2026-11-22")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });

  test("months and years", () => {
    expect(periodOf("monthly", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(periodOf("yearly", "2026-11-16")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(previousPeriod("monthly", "2026-01-15")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  test("isExactPeriod rejects misaligned ranges", () => {
    expect(isExactPeriod("weekly", { start: "2026-11-16", end: "2026-11-22" })).toBe(true);
    expect(isExactPeriod("weekly", { start: "2026-11-17", end: "2026-11-23" })).toBe(false);
  });

  test("studio day and slot use Jakarta time", () => {
    // 2026-11-15 20:30 UTC = 2026-11-16 03:30 WIB
    const t = new Date("2026-11-15T20:30:00Z");
    expect(studioToday(t)).toBe("2026-11-16");
    expect(currentSlot(t)).toBe(1);
    expect(currentSlot(new Date("2026-11-16T06:00:00Z"))).toBe(2); // 13:00 WIB
    expect(currentSlot(new Date("2026-11-16T12:00:00Z"))).toBe(3); // 19:00 WIB
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("aggregateTopics", () => {
  test("groups by normalised topic and rewards agreement across sessions and models", () => {
    const [t] = aggregateTopics([
      f({ topic: "Paper texture", sessionId: "s1", model: "claude" }),
      f({ topic: "paper  texture!", sessionId: "s2", model: "grok", keywords: ["paper", "overlay"] }),
    ]);
    expect(t.key).toBe("paper texture");
    expect(t.occurrences).toBe(2);
    expect(t.sessions).toBe(2);
    expect(t.models).toBe(2);
    expect(t.adjustedConfidence).toBe(7.5); // 6 + 0.5 + 1
    expect(t.keywords[0]).toBe("paper");
    expect(t.opportunityScore).toBe(4.8); // 8 * (11-3)/10 * 0.75
  });

  test("caps confidence of unverified topics", () => {
    const [t] = aggregateTopics([f({ verified: false, confidence: 9 })]);
    expect(t.adjustedConfidence).toBe(5);
  });

  test("ranks low-competition, high-demand topics first", () => {
    const ranked = aggregateTopics([
      f({ topic: "Crowded", demandScore: 9, competitionScore: 9 }),
      f({ topic: "Gap", demandScore: 7, competitionScore: 2 }),
    ]);
    expect(ranked.map((t) => t.topic)).toEqual(["Gap", "Crowded"]);
  });

  test("normalizeTopic", () => {
    expect(normalizeTopic("  Kertas-Lipat, Overlay ")).toBe("kertas lipat overlay");
  });
});

describe("withTrends", () => {
  test("labels new, up, down, stable and lists faded topics", () => {
    const prev = aggregateTopics([
      f({ topic: "A", demandScore: 5 }),
      f({ topic: "B", demandScore: 8 }),
      f({ topic: "C" }),
      f({ topic: "Gone" }),
    ]);
    const cur = aggregateTopics([
      f({ topic: "A", demandScore: 9 }),
      f({ topic: "B", demandScore: 5 }),
      f({ topic: "C" }),
      f({ topic: "Fresh" }),
    ]);
    const { topics, faded } = withTrends(cur, prev);
    const by = Object.fromEntries(topics.map((t) => [t.topic, t.trend]));
    expect(by).toEqual({ A: "up", B: "down", C: "stable", Fresh: "new" });
    expect(faded.map((x) => x.topic)).toEqual(["Gone"]);
  });
});

test("keywordPerformance sums sales per keyword and counts refusals", () => {
  const perf = keywordPerformance([
    { keywords: ["paper", "texture"], status: "published", downloads: 3, revenueUsd: 1.2 },
    { keywords: ["Paper"], status: "platform_rejected", downloads: 0, revenueUsd: 0 },
  ]);
  expect(perf[0]).toEqual({ keyword: "paper", published: 1, refused: 1, downloads: 3, revenueUsd: 1.2 });
});

describe("applyScanSupport", () => {
  test("researched topics flagged by the scout gain confidence; scans alone add nothing", () => {
    const topics = aggregateTopics([
      f({ topic: "Folded paper texture", keywords: ["paper", "texture", "folded"] }),
      f({ topic: "Neon grid", keywords: ["neon", "grid"] }),
    ]);
    const out = applyScanSupport(topics, [
      { scanId: "s1", topic: "folded paper texture", keywords: [] },
      { scanId: "s2", topic: "Kertas lipat tren", keywords: ["Paper", "folded"] },
      { scanId: "s2", topic: "AI art", keywords: ["ai"] },
    ]);
    const paper = out.find((t) => t.key === "folded paper texture")!;
    const neon = out.find((t) => t.key === "neon grid")!;
    expect(paper.scanSupport).toBe(2);
    expect(paper.adjustedConfidence).toBe(7.5); // 6 + 1 + 0.5
    expect(neon.scanSupport).toBe(0);
    expect(neon.adjustedConfidence).toBe(6);
    expect(out.map((t) => t.key)).not.toContain("ai art");
  });

  test("unverified research stays capped even with scan support", () => {
    const [t] = applyScanSupport(aggregateTopics([f({ verified: false, confidence: 4 })]), [{ scanId: "s1", topic: "Paper texture", keywords: [] }]);
    expect(t.adjustedConfidence).toBe(5);
  });
});
