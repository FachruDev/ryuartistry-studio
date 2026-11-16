import { describe, expect, test } from "bun:test";
import { RUBRICS, getRubric, scoreReview } from "./rubrics";

const all = (ids: string[], v: number) => Object.fromEntries(ids.map((id) => [id, v]));

describe("rubric files", () => {
  test.each(Object.values(RUBRICS))("$id weights sum to 1", (r) => {
    expect(r.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
  });
});

describe("scoreReview", () => {
  const rubric = getRubric("idea");
  const gates = all(rubric.gates.map((g) => g.id), 1) as unknown as Record<string, boolean>;
  for (const k in gates) gates[k] = true;
  const criteria = rubric.criteria.map((c) => c.id);

  test("passes at weighted 8 with all gates true", () => {
    const r = scoreReview(rubric, { gates, scores: all(criteria, 8), feedback: { clarity: "Tambahkan palet warna" } });
    expect(r).toEqual({ finalScore: 8, passed: true, failedGates: [] });
  });

  test("a failed gate fails the review even with high scores", () => {
    const r = scoreReview(rubric, {
      gates: { ...gates, no_ip: false },
      scores: all(criteria, 10),
      feedback: { no_ip: "Menyebut nama merek di prompt" },
    });
    expect(r.passed).toBe(false);
    expect(r.failedGates).toEqual(["no_ip"]);
  });

  test("requires feedback for every score below 8", () => {
    expect(() =>
      scoreReview(rubric, { gates, scores: { ...all(criteria, 9), uniqueness: 5 }, feedback: { clarity: "ok" } }),
    ).toThrow(/uniqueness/);
  });

  test("requires at least one suggestion even when passing", () => {
    expect(() => scoreReview(rubric, { gates, scores: all(criteria, 10), feedback: {} })).toThrow(/saran/);
  });

  test("rejects missing gates and unknown criteria", () => {
    expect(() =>
      scoreReview(rubric, { gates: {}, scores: { ...all(criteria, 9), extra: 9 }, feedback: { a: "b" } }),
    ).toThrow(/no_ip[\s\S]*extra/);
  });
});
