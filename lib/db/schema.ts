import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const agentRole = pgEnum("agent_role", [
  "rina",
  "shion",
  "lukas",
  "linda",
  "kechlyn",
  "admin",
]);

export const platform = pgEnum("platform", ["adobe_stock", "facebook_reels"]);

export const productLine = pgEnum("product_line", ["image", "reel"]);

export const jobStatus = pgEnum("job_status", [
  "idea_pending",
  "idea_review",
  "idea_revision",
  "storyboard_pending",
  "storyboard_review",
  "executing",
  "auto_check",
  "final_review",
  "exec_revision",
  "publish_prep",
  "awaiting_approval",
  "scheduled",
  "published",
  "archived",
  "halted",
]);

export const cycleStatus = pgEnum("cycle_status", [
  "open",
  "executing",
  "done",
  "halted",
]);

export const reviewTarget = pgEnum("review_target", [
  "idea",
  "storyboard",
  "asset",
]);

export const failureDiagnosis = pgEnum("failure_diagnosis", [
  "execution",
  "infeasible",
  "weak_idea",
]);

export const reportLevel = pgEnum("report_level", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const publicationStatus = pgEnum("publication_status", [
  "awaiting_approval",
  "approved",
  "rejected",
  "scheduled",
  /** Uploaded to the platform, waiting for its review (Adobe Stock moderation). */
  "submitted",
  "published",
  /** The platform itself refused the asset. */
  "platform_rejected",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: agentRole("role").notNull(),
  model: text("model").notNull(),
  /** sha256 hex of the bearer token. The token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Research (Rina)
// ---------------------------------------------------------------------------

export const researchSessions = pgTable(
  "research_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platform("platform").notNull(),
    day: date("day").notNull(),
    /** 1..3 (morning, midday, evening) */
    slot: smallint("slot").notNull(),
    model: text("model").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    notes: text("notes"),
    ...timestamps,
  },
  // One session per model per slot: Claude and Grok can both research the same slot.
  (t) => [uniqueIndex("research_sessions_slot_uq").on(t.platform, t.day, t.slot, t.model)],
);

export const researchFindings = pgTable(
  "research_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    topic: text("topic").notNull(),
    keywords: text("keywords").array().notNull(),
    demandScore: smallint("demand_score").notNull(),
    competitionScore: smallint("competition_score").notNull(),
    /** "evergreen" or an ISO date / event name */
    seasonality: text("seasonality").notNull(),
    sources: jsonb("sources").$type<{ url: string; accessedAt: string }[]>().notNull(),
    confidence: smallint("confidence").notNull(),
    verified: boolean("verified").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("research_findings_platform_idx").on(t.platform, t.createdAt)],
);

export const researchReports = pgTable(
  "research_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: reportLevel("level").notNull(),
    platform: platform("platform").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    summary: text("summary").notNull(),
    /** Structured opportunities Shion can act on. */
    opportunities: jsonb("opportunities").$type<unknown[]>().notNull().default([]),
    findingIds: uuid("finding_ids").array().notNull().default([]),
    childReportIds: uuid("child_report_ids").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("research_reports_period_uq").on(t.platform, t.level, t.periodStart)],
);

// ---------------------------------------------------------------------------
// Cycles & jobs
// ---------------------------------------------------------------------------

export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: platform("platform").notNull(),
  line: productLine("line").notNull(),
  day: date("day").notNull(),
  researchReportId: uuid("research_report_id").references(() => researchReports.id),
  ideasAttempted: smallint("ideas_attempted").notNull().default(0),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  status: cycleStatus("status").notNull().default("open"),
  haltReason: text("halt_reason"),
  ...timestamps,
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => cycles.id),
    platform: platform("platform").notNull(),
    line: productLine("line").notNull(),
    status: jobStatus("status").notNull().default("idea_pending"),
    /** 1-based order of this idea within its cycle */
    ideaNumber: smallint("idea_number").notNull(),
    ideaRevisionCount: smallint("idea_revision_count").notNull().default(0),
    storyboardRevisionCount: smallint("storyboard_revision_count").notNull().default(0),
    execRevisionCount: smallint("exec_revision_count").notNull().default(0),
    returnedFromExec: boolean("returned_from_exec").notNull().default(false),
    /** Best (latest) idea review score, used for the cycle fallback. */
    lastIdeaScore: real("last_idea_score"),
    archiveReason: text("archive_reason"),
    /** Stage at which the job was archived: "idea" | "storyboard" | "execution". */
    archiveStage: text("archive_stage"),
    claimedBy: uuid("claimed_by").references(() => agents.id),
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    costUsd: real("cost_usd").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_idx").on(t.status, t.updatedAt),
    index("jobs_cycle_idx").on(t.cycleId),
  ],
);

export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  kind: reviewTarget("kind").notNull(), // "idea" | "storyboard"
  /** Brief (image) or script + scenes (reel storyboard). */
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  authorAgentId: uuid("author_agent_id").references(() => agents.id),
  ...timestamps,
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    target: reviewTarget("target").notNull(),
    /** id of the idea or asset version that was reviewed */
    targetId: uuid("target_id").notNull(),
    reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id),
    rubricId: text("rubric_id").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    gates: jsonb("gates").$type<Record<string, boolean>>().notNull(),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    feedback: jsonb("feedback").$type<Record<string, string>>().notNull(),
    summary: text("summary").notNull(),
    finalScore: real("final_score").notNull(),
    passed: boolean("passed").notNull(),
    diagnosis: failureDiagnosis("diagnosis"),
    ...timestamps,
  },
  (t) => [index("reviews_job_idx").on(t.jobId, t.createdAt)],
);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  s3Key: text("s3_key").notNull(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes"),
  width: integer("width"),
  height: integer("height"),
  durationSec: real("duration_sec"),
  phash: text("phash"),
  autoCheck: jsonb("auto_check").$type<{ passed: boolean; problems: string[] }>(),
  /** Facts read from the file (video: codecs, loudness, fps...) and derived files (keyframe sheet). */
  media: jsonb("media").$type<{ video?: Record<string, unknown>; framesKey?: string | null }>(),
  notes: text("notes"),
  ...timestamps,
});

export const ideaGraveyard = pgTable("idea_graveyard", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id),
  platform: platform("platform").notNull(),
  line: productLine("line").notNull(),
  summary: text("summary").notNull(),
  reason: text("reason").notNull(),
  ...timestamps,
});

export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  platform: platform("platform").notNull(),
  title: text("title").notNull(),
  caption: text("caption"),
  keywords: text("keywords").array().notNull().default([]),
  hashtags: text("hashtags").array().notNull().default([]),
  category: text("category"),
  /** File name used on the platform; must match the CSV row for Adobe Stock (<= 30 chars). */
  fileName: text("file_name"),
  aiLabel: boolean("ai_label").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  status: publicationStatus("status").notNull().default("awaiting_approval"),
  reviewerNote: text("reviewer_note"),
  /** Human 1-10 score given at approval time, used to calibrate Kechlyn's rubric. */
  humanScore: smallint("human_score"),
  /** Score Kechlyn gave the approved asset version, copied for calibration. */
  agentScore: real("agent_score"),
  platformNote: text("platform_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  externalId: text("external_id"),
  ...timestamps,
});

export const performance = pgTable(
  "performance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    revenueUsd: real("revenue_usd").notNull().default(0),
    ...timestamps,
  },
  // Re-importing the same day overwrites instead of double counting.
  (t) => [uniqueIndex("performance_day_uq").on(t.publicationId, t.day)],
);

export const transitions = pgTable(
  "transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromStatus: jobStatus("from_status"),
    toStatus: jobStatus("to_status").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transitions_job_idx").on(t.jobId, t.createdAt)],
);

export const usageCosts = pgTable("usage_costs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id),
  jobId: uuid("job_id").references(() => jobs.id),
  description: text("description").notNull(),
  costUsd: real("cost_usd").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobStatus = (typeof jobStatus.enumValues)[number];
export type AgentRole = (typeof agentRole.enumValues)[number];
export type Platform = (typeof platform.enumValues)[number];
export type ProductLine = (typeof productLine.enumValues)[number];
export type FailureDiagnosis = (typeof failureDiagnosis.enumValues)[number];
