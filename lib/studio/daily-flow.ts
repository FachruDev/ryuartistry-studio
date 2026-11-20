/**
 * The studio's daily flow, from trend scan to publication, as stages with a status each.
 * Pure: the service passes in what happened that day, this decides what each stage shows.
 */
import type { JobStatus, Platform } from "@/lib/db/schema";

export type FlowStageKey =
  | "scan"
  | "research"
  | "report"
  | "idea"
  | "idea_review"
  | "storyboard"
  | "storyboard_review"
  | "execution"
  | "final_review"
  | "metadata"
  | "approval"
  | "published";

export type FlowStageDef = { key: FlowStageKey; label: string; who: string };

const RESEARCH: FlowStageDef[] = [
  { key: "scan", label: "Pindai tren", who: "Rina-Scout" },
  { key: "research", label: "Riset mendalam", who: "Rina" },
  { key: "report", label: "Laporan harian", who: "Rina" },
];
const IDEAS: FlowStageDef[] = [
  { key: "idea", label: "Ide", who: "Shion" },
  { key: "idea_review", label: "Review ide", who: "Lukas" },
];
const STORYBOARD: FlowStageDef[] = [
  { key: "storyboard", label: "Storyboard", who: "Shion" },
  { key: "storyboard_review", label: "Review storyboard", who: "Lukas" },
];
const DELIVERY: FlowStageDef[] = [
  { key: "execution", label: "Eksekusi", who: "Linda" },
  { key: "final_review", label: "Review akhir", who: "Kechlyn" },
  { key: "metadata", label: "Metadata", who: "Kechlyn" },
  { key: "approval", label: "Persetujuan", who: "Kamu" },
  { key: "published", label: "Terbit", who: "Platform" },
];

export function flowStages(platform: Platform): FlowStageDef[] {
  return platform === "facebook_reels" ? [...RESEARCH, ...IDEAS, ...STORYBOARD, ...DELIVERY] : [...RESEARCH, ...IDEAS, ...DELIVERY];
}

/** A job has passed a stage once it visited any of these statuses. */
const PASSED_AT: Partial<Record<FlowStageKey, JobStatus[]>> = {
  idea: ["idea_review"],
  idea_review: ["storyboard_pending", "executing"],
  storyboard: ["storyboard_review"],
  storyboard_review: ["executing"],
  execution: ["final_review"],
  final_review: ["publish_prep"],
  metadata: ["awaiting_approval", "scheduled"],
  approval: ["scheduled", "published"],
  published: ["published"],
};

/** The stage a job is currently waiting in. */
const ACTIVE_IN: Partial<Record<JobStatus, FlowStageKey>> = {
  idea_pending: "idea",
  idea_revision: "idea",
  idea_review: "idea_review",
  storyboard_pending: "storyboard",
  storyboard_review: "storyboard_review",
  executing: "execution",
  exec_revision: "execution",
  auto_check: "execution",
  final_review: "final_review",
  publish_prep: "metadata",
  awaiting_approval: "approval",
  scheduled: "published",
};

export type JobTrace = { status: JobStatus; visited: JobStatus[] };
export type DayFacts = {
  scans: number;
  researchSessions: number;
  dailyReport: boolean;
  cycles: number;
  jobs: JobTrace[];
  /** The day is over (studio time), so research that did not happen is a miss, not "later". */
  dayClosed: boolean;
};

export type StageState = "done" | "active" | "failed" | "waiting";
export type FlowStage = FlowStageDef & { state: StageState; passed: number; active: number; total: number; note: string };
export type DayOutcome = "complete" | "partial" | "running" | "stalled" | "empty";

export const SCAN_SLOTS = 3;

export function computeDayFlow(platform: Platform, f: DayFacts) {
  const ended = (j: JobTrace) => j.status === "archived" || j.status === "halted" || j.status === "published";
  const anyRunning = f.jobs.some((j) => !ended(j));
  let previousDone = true;

  const stages: FlowStage[] = flowStages(platform).map((def) => {
    let passed = 0;
    let active = 0;
    let total = 0;
    let note = "";
    if (def.key === "scan") {
      passed = f.scans;
      total = SCAN_SLOTS;
      note = `${f.scans}/${SCAN_SLOTS} slot`;
    } else if (def.key === "research") {
      passed = f.researchSessions;
      total = 1;
      note = f.researchSessions ? `${f.researchSessions} sesi` : "";
    } else if (def.key === "report") {
      passed = f.dailyReport ? 1 : 0;
      total = 1;
      note = f.dailyReport ? `${f.cycles} siklus dibuka` : "";
    } else {
      const statuses = PASSED_AT[def.key] ?? [];
      total = f.jobs.length;
      passed = f.jobs.filter((j) => j.visited.some((s) => statuses.includes(s)) || statuses.includes(j.status)).length;
      active = f.jobs.filter((j) => ACTIVE_IN[j.status] === def.key).length;
      note = total ? `${passed}/${total} job${active ? ` · ${active} berjalan` : ""}` : "";
    }

    // Research stages miss only once the day is over; a job stage fails when every job ended before it.
    const isResearch = def.key === "scan" || def.key === "research" || def.key === "report";
    const state: StageState =
      passed > 0
        ? "done"
        : active > 0
          ? "active"
          : isResearch
            ? f.dayClosed ? "failed" : "waiting"
            : total > 0 && previousDone && !anyRunning ? "failed" : "waiting";
    previousDone = state === "done";
    return { ...def, state, passed, active, total, note };
  });

  const published = f.jobs.filter((j) => j.status === "published" || j.visited.includes("published")).length;
  const outcome: DayOutcome =
    f.cycles === 0 && !f.scans && !f.researchSessions
      ? "empty"
      : f.cycles > 0 && published >= f.cycles
        ? "complete"
        : anyRunning
          ? "running"
          : published > 0
            ? "partial"
            : "stalled";
  const furthest = [...stages].reverse().find((s) => s.state === "done") ?? null;
  return { stages, published, cycles: f.cycles, outcome, furthest: furthest?.key ?? null };
}

export type DayFlow = ReturnType<typeof computeDayFlow>;
