import { describe, expect, test } from "bun:test";
import {
  decideAutoCheck,
  decideCycleAfterArchive,
  decideFinalReview,
  decideIdeaReview,
  decideStoryboardReview,
  type JobCounters,
} from "./workflow";

const fresh = (over: Partial<JobCounters> = {}): JobCounters => ({
  line: "image",
  ideaRevisionCount: 0,
  storyboardRevisionCount: 0,
  execRevisionCount: 0,
  returnedFromExec: false,
  ...over,
});

describe("idea review (Shion <-> Lukas)", () => {
  test("image idea that passes goes to execution", () => {
    expect(decideIdeaReview(fresh(), true).status).toBe("executing");
  });

  test("reel idea that passes goes to storyboard", () => {
    expect(decideIdeaReview(fresh({ line: "reel" }), true).status).toBe("storyboard_pending");
  });

  test("allows exactly 3 revisions, then archives", () => {
    let job = fresh();
    for (let i = 1; i <= 3; i++) {
      const d = decideIdeaReview(job, false);
      expect(d.status).toBe("idea_revision");
      expect(d.patch.ideaRevisionCount).toBe(i);
      job = { ...job, ...d.patch };
    }
    const last = decideIdeaReview(job, false);
    expect(last.status).toBe("archived");
    expect(last.archive?.stage).toBe("idea");
  });
});

describe("storyboard review", () => {
  test("archives after 3 failed revisions", () => {
    const d = decideStoryboardReview(fresh({ line: "reel", storyboardRevisionCount: 3 }), false);
    expect(d.status).toBe("archived");
    expect(d.archive?.stage).toBe("storyboard");
  });
});

describe("execution (Linda <-> Kechlyn)", () => {
  test("execution problem goes back to Linda while revisions remain", () => {
    const d = decideFinalReview(fresh({ execRevisionCount: 2 }), false, "execution");
    expect(d.status).toBe("exec_revision");
    expect(d.patch.execRevisionCount).toBe(3);
  });

  test("after 3 execution revisions the idea returns to Lukas with counters reset", () => {
    const d = decideFinalReview(fresh({ execRevisionCount: 3, ideaRevisionCount: 2 }), false, "execution");
    expect(d.status).toBe("idea_review");
    expect(d.patch).toMatchObject({ returnedFromExec: true, ideaRevisionCount: 0, execRevisionCount: 0 });
  });

  test("infeasible idea returns to Lukas immediately", () => {
    expect(decideFinalReview(fresh(), false, "infeasible").status).toBe("idea_review");
  });

  test("an idea can only come back from execution once", () => {
    const d = decideFinalReview(fresh({ returnedFromExec: true }), false, "weak_idea");
    expect(d.status).toBe("archived");
    expect(d.archive?.stage).toBe("execution");
  });

  test("failing review without diagnosis is rejected", () => {
    expect(() => decideFinalReview(fresh(), false, null)).toThrow();
  });

  test("auto check failures count as execution revisions", () => {
    expect(decideAutoCheck(fresh(), false).patch.execRevisionCount).toBe(1);
    expect(decideAutoCheck(fresh(), true).status).toBe("final_review");
  });
});

describe("cycle fallback", () => {
  const archived = (id: string, score: number | null, stage = "idea") => ({
    id,
    status: "archived" as const,
    archiveStage: stage,
    lastIdeaScore: score,
  });

  test("does nothing while another job is active", () => {
    const d = decideCycleAfterArchive({
      ideasAttempted: 2,
      fallbackUsed: false,
      jobs: [archived("a", 5), { id: "b", status: "executing", archiveStage: null, lastIdeaScore: 8 }],
    });
    expect(d.action).toBe("none");
  });

  test("asks for a new idea while fewer than 3 were tried", () => {
    expect(decideCycleAfterArchive({ ideasAttempted: 2, fallbackUsed: false, jobs: [archived("a", 5)] }).action).toBe(
      "new_idea",
    );
  });

  test("picks the best archived idea when it scores at least 6", () => {
    const d = decideCycleAfterArchive({
      ideasAttempted: 3,
      fallbackUsed: false,
      jobs: [archived("a", 6.2), archived("b", 7.4), archived("c", 9, "execution")],
    });
    expect(d).toEqual({ action: "fallback", jobId: "b", score: 7.4 });
  });

  test("halts when every idea scored below 6", () => {
    const d = decideCycleAfterArchive({
      ideasAttempted: 3,
      fallbackUsed: false,
      jobs: [archived("a", 5.9), archived("b", 4)],
    });
    expect(d.action).toBe("halt");
  });

  test("halts when the fallback idea also fails", () => {
    const d = decideCycleAfterArchive({ ideasAttempted: 3, fallbackUsed: true, jobs: [archived("a", 7)] });
    expect(d.action).toBe("halt");
  });
});
