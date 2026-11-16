import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  agentHealth,
  autoPublishDecision,
  dailyBudgetState,
  jobOverBudget,
  parseSettings,
  stalledJobs,
} from "./automation";

const now = new Date("2026-11-16T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("settings", () => {
  test("partial stored values merge onto defaults", () => {
    const s = parseSettings({ autoPublish: { adobe_stock: true }, budget: { perJobUsd: 2 } });
    expect(s.autoPublish).toEqual({ adobe_stock: true, facebook_reels: false });
    expect(s.budget).toEqual({ dailyUsd: { adobe_stock: null, facebook_reels: null }, perJobUsd: 2 });
    expect(s.staleQueueHours).toBe(6);
  });

  test("invalid stored values fall back to defaults instead of breaking", () => {
    expect(parseSettings({ webhookUrl: "http://insecure.example" })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("budgets", () => {
  test("daily budget blocks at the limit and reports what is left", () => {
    expect(dailyBudgetState(3.2, 5)).toEqual({ blocked: false, remainingUsd: 1.8 });
    expect(dailyBudgetState(5, 5)).toEqual({ blocked: true, remainingUsd: 0 });
    expect(dailyBudgetState(99, null)).toEqual({ blocked: false, remainingUsd: null });
  });

  test("per-job cap", () => {
    expect(jobOverBudget(1.01, 1)).toBe(true);
    expect(jobOverBudget(1, 1)).toBe(false);
    expect(jobOverBudget(50, null)).toBe(false);
  });
});

describe("auto-publish", () => {
  const on = parseSettings({ autoPublish: { adobe_stock: true } });
  test("needs both the switch and calibration", () => {
    expect(autoPublishDecision(on, "adobe_stock", true).auto).toBe(true);
    expect(autoPublishDecision(on, "adobe_stock", false).auto).toBe(false);
    expect(autoPublishDecision(on, "facebook_reels", true).auto).toBe(false);
  });
});

describe("health", () => {
  test("stalled jobs only count agent stages", () => {
    const s = stalledJobs(
      [
        { id: "a", status: "executing", platform: "adobe_stock", updatedAt: hoursAgo(7) },
        { id: "b", status: "executing", platform: "adobe_stock", updatedAt: hoursAgo(2) },
        { id: "c", status: "awaiting_approval", platform: "adobe_stock", updatedAt: hoursAgo(50) },
      ],
      now,
      6,
    );
    expect(s).toEqual([{ id: "a", status: "executing", platform: "adobe_stock", updatedAt: hoursAgo(7), agent: "Linda", hours: 7 }]);
  });

  test("agent heartbeat", () => {
    expect(agentHealth(null, now, 12)).toBe("never");
    expect(agentHealth(hoursAgo(3), now, 12)).toBe("active");
    expect(agentHealth(hoursAgo(13), now, 12)).toBe("quiet");
  });
});
