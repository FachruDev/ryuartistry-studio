import type { AgentRole, JobStatus, Platform, ProductLine } from "@/lib/db/schema";

/** Workflow limits from docs/design.md §4.3. Changing them changes the rules for every agent. */
export const LIMITS = {
  /** Minimum weighted score for a review to pass. */
  passScore: 8,
  /** Minimum score an archived idea needs to be picked by the cycle fallback. */
  fallbackMinScore: 6,
  maxIdeaRevisions: 3,
  maxStoryboardRevisions: 3,
  maxIdeasPerCycle: 3,
  maxExecRevisions: 3,
  /** How many times one idea may be sent back from execution to the idea stage. */
  maxExecReturns: 1,
  /** How long a claimed job stays reserved for the agent that claimed it. */
  claimMinutes: 30,
} as const;

/** Which product line each platform produces. */
export const LINE_FOR_PLATFORM: Record<Platform, ProductLine> = {
  adobe_stock: "image",
  facebook_reels: "reel",
};

/** How many cycles a daily research report opens. One cycle aims to ship one asset. */
export const CYCLES_PER_DAILY_REPORT: Record<Platform, number> = {
  adobe_stock: 5,
  facebook_reels: 1,
};

/** Statuses each role works on, in priority order (revisions before new work). */
export const ROLE_QUEUES: Record<Exclude<AgentRole, "admin" | "rina">, JobStatus[]> = {
  shion: ["idea_revision", "storyboard_pending", "idea_pending"],
  lukas: ["idea_review", "storyboard_review"],
  linda: ["exec_revision", "executing"],
  kechlyn: ["final_review", "publish_prep"],
};

export const PLATFORM_SPECS = {
  adobe_stock: {
    minMegapixels: 4,
    contentTypes: ["image/jpeg"],
    maxKeywords: 49,
  },
  facebook_reels: {
    width: 1080,
    height: 1920,
    minDurationSec: 30,
    maxDurationSec: 60,
    contentTypes: ["video/mp4"],
  },
} as const;
