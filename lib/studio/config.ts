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

/**
 * Adobe Stock categories for the CSV "Category" column (number -> name).
 * Source: Adobe Stock contributor category list; verify against the portal if Adobe changes it.
 */
export const ADOBE_CATEGORIES: Record<number, string> = {
  1: "Animals",
  2: "Buildings and Architecture",
  3: "Business",
  4: "Drinks",
  5: "The Environment",
  6: "States of Mind",
  7: "Food",
  8: "Graphic Resources",
  9: "Hobbies and Leisure",
  10: "Industry",
  11: "Landscape",
  12: "Lifestyle",
  13: "People",
  14: "Plants and Flowers",
  15: "Culture and Religion",
  16: "Science",
  17: "Social Issues",
  18: "Sports",
  19: "Technology",
  20: "Transport",
  21: "Travel",
};

/** Thresholds a platform must reach before publishing may run without a human (design §10). */
export const AUTO_MODE_CRITERIA = {
  minHumanReviewed: 50,
  minHumanApprovalRate: 0.9,
  minPlatformAcceptanceRate: 0.8,
} as const;

export const PLATFORM_SPECS = {
  adobe_stock: {
    // https://helpx.adobe.com/stock/contributor/submit-your-content/submit-photos/technical-legal-requirements-photo-submission.html
    minMegapixels: 4,
    maxMegapixels: 100,
    maxBytes: 45 * 1024 * 1024,
    contentTypes: ["image/jpeg"],
    colorSpaces: ["srgb"],
    // https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html
    maxTitleLength: 70,
    maxFileNameLength: 30,
    minKeywords: 5,
    maxKeywords: 49,
    /** dHash distance at or below which two images count as near-duplicates. */
    duplicateMaxDistance: 6,
  },
  facebook_reels: {
    /** 9:16 portrait, at least 1080 px wide (1080x1920 recommended). */
    aspectRatio: 9 / 16,
    aspectTolerance: 0.01,
    minWidth: 1080,
    minDurationSec: 30,
    maxDurationSec: 60,
    minFps: 23,
    maxFps: 60,
    maxBytes: 300 * 1024 * 1024,
    contentTypes: ["video/mp4"],
    videoCodecs: ["h264"],
    audioCodecs: ["aac"],
    /** Integrated loudness window around the -14 LUFS that social platforms normalise to. */
    minLoudnessLufs: -18,
    maxLoudnessLufs: -10,
    /** True peak above this clips after the platform re-encodes. */
    maxTruePeakDb: -1,
    duplicateMaxDistance: 6,
    maxCaptionLength: 2200,
    maxHashtags: 10,
  },
} as const;

/**
 * Facebook channel identity. Meta demonetises unoriginal, mass-produced content, so every
 * reel must fit the channel niche. Set STUDIO_REELS_NICHE (e.g. "fakta sains singkat").
 */
export const REELS_CHANNEL = {
  niche: process.env.STUDIO_REELS_NICHE?.trim() || null,
};
