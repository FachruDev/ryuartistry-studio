import { expect, test } from "bun:test";
import { computeDayFlow, flowStages, type DayFacts } from "./daily-flow";

const base: DayFacts = { scans: 0, researchSessions: 0, dailyReport: false, cycles: 0, jobs: [], dayClosed: false };
const state = (f: ReturnType<typeof computeDayFlow>, key: string) => f.stages.find((s) => s.key === key)?.state;

test("reels add storyboard stages, images do not", () => {
  expect(flowStages("adobe_stock").map((s) => s.key)).not.toContain("storyboard");
  expect(flowStages("facebook_reels").map((s) => s.key)).toContain("storyboard_review");
});

test("an empty day that is still open is waiting, a closed one is a miss", () => {
  expect(computeDayFlow("adobe_stock", base).outcome).toBe("empty");
  expect(state(computeDayFlow("adobe_stock", base), "research")).toBe("waiting");
  expect(state(computeDayFlow("adobe_stock", { ...base, dayClosed: true }), "research")).toBe("failed");
});

test("jobs drive the production stages", () => {
  const f = computeDayFlow("adobe_stock", {
    ...base,
    scans: 2,
    researchSessions: 1,
    dailyReport: true,
    cycles: 2,
    jobs: [
      { status: "final_review", visited: ["idea_pending", "idea_review", "executing", "auto_check", "final_review"] },
      { status: "idea_revision", visited: ["idea_pending", "idea_review", "idea_revision"] },
    ],
  });
  expect(state(f, "scan")).toBe("done");
  expect(state(f, "idea")).toBe("done");
  expect(state(f, "execution")).toBe("done");
  expect(state(f, "final_review")).toBe("active");
  expect(state(f, "published")).toBe("waiting");
  expect(f.outcome).toBe("running");
  expect(f.furthest).toBe("execution");
});

test("a day is complete when every cycle published, stalled when all jobs ended unpublished", () => {
  const published = { status: "published" as const, visited: ["idea_review", "executing", "final_review", "publish_prep", "awaiting_approval", "scheduled", "published"] as const };
  const done = computeDayFlow("adobe_stock", { ...base, dailyReport: true, cycles: 1, jobs: [{ ...published, visited: [...published.visited] }] });
  expect(done.outcome).toBe("complete");
  expect(done.published).toBe(1);

  const stalled = computeDayFlow("adobe_stock", { ...base, dailyReport: true, cycles: 1, jobs: [{ status: "archived", visited: ["idea_review", "idea_revision"] }] });
  expect(stalled.outcome).toBe("stalled");
  expect(state(stalled, "idea_review")).toBe("failed");
});
