/**
 * Pure workflow rules (docs/design.md §4). No database access here: the service layer
 * loads the job, asks these functions what happens next, and persists the result.
 */
import type { FailureDiagnosis, JobStatus, ProductLine } from "@/lib/db/schema";
import { LIMITS } from "./config";

export type JobCounters = {
  line: ProductLine;
  ideaRevisionCount: number;
  storyboardRevisionCount: number;
  execRevisionCount: number;
  returnedFromExec: boolean;
};

export type ArchiveStage = "idea" | "storyboard" | "execution";

export type Decision = {
  status: JobStatus;
  /** Counter fields to write back to the job. */
  patch: Partial<Omit<JobCounters, "line">>;
  /** Present when the job is archived. */
  archive?: { stage: ArchiveStage; reason: string };
  reason: string;
};

function afterIdeaApproved(line: ProductLine): JobStatus {
  return line === "reel" ? "storyboard_pending" : "executing";
}

/** Lukas reviewed an idea. */
export function decideIdeaReview(job: JobCounters, passed: boolean): Decision {
  if (passed) {
    return {
      status: afterIdeaApproved(job.line),
      patch: {},
      reason: "Ide lolos review Lukas",
    };
  }
  if (job.ideaRevisionCount < LIMITS.maxIdeaRevisions) {
    const next = job.ideaRevisionCount + 1;
    return {
      status: "idea_revision",
      patch: { ideaRevisionCount: next },
      reason: `Ide tidak lolos, revisi ke-${next} dari ${LIMITS.maxIdeaRevisions}`,
    };
  }
  return {
    status: "archived",
    patch: {},
    archive: {
      stage: "idea",
      reason: `Ide tidak lolos setelah ${LIMITS.maxIdeaRevisions} revisi`,
    },
    reason: "Batas revisi ide tercapai",
  };
}

/** Lukas reviewed a reel storyboard. */
export function decideStoryboardReview(job: JobCounters, passed: boolean): Decision {
  if (passed) {
    return { status: "executing", patch: {}, reason: "Storyboard lolos review Lukas" };
  }
  if (job.storyboardRevisionCount < LIMITS.maxStoryboardRevisions) {
    const next = job.storyboardRevisionCount + 1;
    return {
      status: "storyboard_pending",
      patch: { storyboardRevisionCount: next },
      reason: `Storyboard tidak lolos, revisi ke-${next} dari ${LIMITS.maxStoryboardRevisions}`,
    };
  }
  return {
    status: "archived",
    patch: {},
    archive: {
      stage: "storyboard",
      reason: `Storyboard tidak lolos setelah ${LIMITS.maxStoryboardRevisions} revisi`,
    },
    reason: "Batas revisi storyboard tercapai",
  };
}

/** Sends an executed idea back to Lukas, or archives it if it already came back once. */
function returnToIdeaStage(job: JobCounters, why: string): Decision {
  if (job.returnedFromExec) {
    return {
      status: "archived",
      patch: {},
      archive: {
        stage: "execution",
        reason: `${why}; ide ini sudah pernah dikembalikan dari eksekusi`,
      },
      reason: "Batas pengembalian dari eksekusi tercapai",
    };
  }
  return {
    status: "idea_review",
    patch: {
      returnedFromExec: true,
      ideaRevisionCount: 0,
      storyboardRevisionCount: 0,
      execRevisionCount: 0,
    },
    reason: `${why}; dikembalikan ke Lukas untuk diteruskan ke Shion`,
  };
}

function execRevisionOrReturn(job: JobCounters, why: string): Decision {
  if (job.execRevisionCount < LIMITS.maxExecRevisions) {
    const next = job.execRevisionCount + 1;
    return {
      status: "exec_revision",
      patch: { execRevisionCount: next },
      reason: `${why}, revisi eksekusi ke-${next} dari ${LIMITS.maxExecRevisions}`,
    };
  }
  return returnToIdeaStage(job, `Eksekusi gagal setelah ${LIMITS.maxExecRevisions} revisi`);
}

/** Server-side technical checks finished. */
export function decideAutoCheck(job: JobCounters, passed: boolean): Decision {
  if (passed) return { status: "final_review", patch: {}, reason: "Cek teknis lolos" };
  return execRevisionOrReturn(job, "Cek teknis gagal");
}

/** Kechlyn reviewed the final asset. A failing review must carry a diagnosis. */
export function decideFinalReview(
  job: JobCounters,
  passed: boolean,
  diagnosis: FailureDiagnosis | null,
): Decision {
  if (passed) {
    return { status: "publish_prep", patch: {}, reason: "Aset lolos review Kechlyn" };
  }
  if (!diagnosis) throw new Error("A failing final review needs a diagnosis");
  if (diagnosis === "execution") {
    return execRevisionOrReturn(job, "Eksekusi kurang");
  }
  const why =
    diagnosis === "infeasible"
      ? "Ide tidak bisa dieksekusi dengan baik oleh tool yang ada"
      : "Ide lemah walau eksekusi sudah benar";
  return returnToIdeaStage(job, why);
}

/** A human approved or rejected the publication. */
export function decideApproval(approved: boolean): Decision {
  return approved
    ? { status: "scheduled", patch: {}, reason: "Disetujui manusia" }
    : { status: "exec_revision", patch: {}, reason: "Ditolak manusia, kembali ke Linda" };
}

// ---------------------------------------------------------------------------
// Cycle rules (§4.3, loop ide)
// ---------------------------------------------------------------------------

export type CycleJob = {
  id: string;
  status: JobStatus;
  archiveStage: string | null;
  lastIdeaScore: number | null;
};

export type CycleState = {
  ideasAttempted: number;
  fallbackUsed: boolean;
  jobs: CycleJob[];
};

export type CycleDecision =
  | { action: "none" }
  | { action: "new_idea" }
  | { action: "fallback"; jobId: string; score: number }
  | { action: "halt"; reason: string };

const TERMINAL: JobStatus[] = ["archived", "halted"];

/** Decides what the cycle does after one of its jobs was archived. */
export function decideCycleAfterArchive(cycle: CycleState): CycleDecision {
  if (cycle.jobs.some((j) => !TERMINAL.includes(j.status))) return { action: "none" };

  if (cycle.ideasAttempted < LIMITS.maxIdeasPerCycle) return { action: "new_idea" };

  if (!cycle.fallbackUsed) {
    const best = cycle.jobs
      .filter((j) => j.archiveStage === "idea" && j.lastIdeaScore !== null)
      .sort((a, b) => (b.lastIdeaScore ?? 0) - (a.lastIdeaScore ?? 0))[0];
    if (best && (best.lastIdeaScore ?? 0) >= LIMITS.fallbackMinScore) {
      return { action: "fallback", jobId: best.id, score: best.lastIdeaScore! };
    }
    return {
      action: "halt",
      reason: `${LIMITS.maxIdeasPerCycle} ide gagal dan tidak ada yang mencapai skor ${LIMITS.fallbackMinScore}; kemungkinan riset hari ini lemah`,
    };
  }

  return { action: "halt", reason: "Ide fallback juga gagal" };
}

/** Status a fallback job resumes at. */
export function fallbackResumeStatus(line: ProductLine): JobStatus {
  return afterIdeaApproved(line);
}
