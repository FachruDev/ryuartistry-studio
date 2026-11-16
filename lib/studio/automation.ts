/**
 * Phase 4 automation rules (pure). The service layer loads data, these functions decide.
 */
import { z } from "zod";
import type { JobStatus, Platform } from "@/lib/db/schema";

const platformMap = <T extends z.ZodType>(t: T) => z.object({ adobe_stock: t, facebook_reels: t });

export const automationSettingsSchema = z.object({
  /** Skip human approval when the platform's calibration criteria are met. */
  autoPublish: platformMap(z.boolean()),
  budget: z.object({
    /** Max spend per platform per studio day (USD); null = no limit. */
    dailyUsd: platformMap(z.number().min(0).max(10_000).nullable()),
    /** A job whose cost passes this is halted; null = no limit. */
    perJobUsd: z.number().min(0).max(1_000).nullable(),
  }),
  /** A job sitting in one agent stage longer than this is reported as stalled. */
  staleQueueHours: z.number().min(1).max(168),
  /** An agent with no MCP call for this long is reported as quiet. */
  agentQuietHours: z.number().min(1).max(168),
  /** Optional JSON webhook (e.g. Discord/Slack-compatible) for warn/critical notifications. */
  webhookUrl: z.string().url().startsWith("https://").nullable(),
});

export type AutomationSettings = z.infer<typeof automationSettingsSchema>;

export const DEFAULT_SETTINGS: AutomationSettings = {
  autoPublish: { adobe_stock: false, facebook_reels: false },
  budget: { dailyUsd: { adobe_stock: null, facebook_reels: null }, perJobUsd: null },
  staleQueueHours: 6,
  agentQuietHours: 12,
  webhookUrl: null,
};

/** Merges a stored (possibly partial or outdated) value onto the defaults. */
export function parseSettings(stored: unknown): AutomationSettings {
  const s = (stored ?? {}) as Partial<AutomationSettings>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...s,
    autoPublish: { ...DEFAULT_SETTINGS.autoPublish, ...s.autoPublish },
    budget: {
      ...DEFAULT_SETTINGS.budget,
      ...s.budget,
      dailyUsd: { ...DEFAULT_SETTINGS.budget.dailyUsd, ...s.budget?.dailyUsd },
    },
  };
  const r = automationSettingsSchema.safeParse(merged);
  return r.success ? r.data : DEFAULT_SETTINGS;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export function dailyBudgetState(spentUsd: number, limitUsd: number | null) {
  if (limitUsd == null) return { blocked: false, remainingUsd: null as number | null };
  const remaining = Math.round((limitUsd - spentUsd) * 100) / 100;
  return { blocked: remaining <= 0, remainingUsd: Math.max(0, remaining) };
}

export function jobOverBudget(jobCostUsd: number, perJobUsd: number | null): boolean {
  return perJobUsd != null && jobCostUsd > perJobUsd;
}

// ---------------------------------------------------------------------------
// Auto-publish
// ---------------------------------------------------------------------------

/**
 * Auto-approval needs BOTH the operator switch and the platform's calibration criteria.
 * If calibration falls below the bar later, publishing silently goes back to manual.
 */
export function autoPublishDecision(settings: AutomationSettings, platform: Platform, calibrationReady: boolean) {
  if (!settings.autoPublish[platform]) return { auto: false, reason: "Publikasi otomatis nonaktif" };
  if (!calibrationReady) return { auto: false, reason: "Syarat kalibrasi belum tercapai; tetap butuh approval manusia" };
  return { auto: true, reason: "Disetujui otomatis: kalibrasi tercapai dan publikasi otomatis aktif" };
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

/** Stages where an agent (not the human) is expected to move the job. */
export const AGENT_STAGES: Partial<Record<JobStatus, string>> = {
  idea_pending: "Shion",
  idea_revision: "Shion",
  storyboard_pending: "Shion",
  idea_review: "Lukas",
  storyboard_review: "Lukas",
  executing: "Linda",
  exec_revision: "Linda",
  final_review: "Kechlyn",
  publish_prep: "Kechlyn",
};

export type JobAge = { id: string; status: JobStatus; platform: Platform; updatedAt: Date };

export function stalledJobs(jobs: JobAge[], now: Date, staleHours: number) {
  const limit = staleHours * 3_600_000;
  return jobs
    .filter((j) => AGENT_STAGES[j.status] && now.getTime() - j.updatedAt.getTime() > limit)
    .map((j) => ({ ...j, agent: AGENT_STAGES[j.status]!, hours: Math.floor((now.getTime() - j.updatedAt.getTime()) / 3_600_000) }));
}

export type AgentHealth = "active" | "quiet" | "never";

export function agentHealth(lastSeenAt: Date | null, now: Date, quietHours: number): AgentHealth {
  if (!lastSeenAt) return "never";
  return now.getTime() - lastSeenAt.getTime() > quietHours * 3_600_000 ? "quiet" : "active";
}
