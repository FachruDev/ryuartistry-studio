/**
 * Trend scans from Rina-Scout (Grok): fast signals of what is rising today. They are input for
 * Rina's deep research (Claude), never findings on their own, so they do not affect scores or
 * open production cycles.
 */
import { date, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents, platform } from "./schema";

export type TrendSignal = {
  topic: string;
  /** Why it is rising right now (event, viral post, season...). */
  why: string;
  keywords: string[];
  /** 1-10: how fast it is rising. */
  momentum: number;
  sources: { url: string; accessedAt: string }[];
};

export const trendScans = pgTable(
  "trend_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platform("platform").notNull(),
    day: date("day").notNull(),
    /** 1..3 (morning, midday, evening, WIB). */
    slot: smallint("slot").notNull(),
    model: text("model").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    signals: jsonb("signals").$type<TrendSignal[]>().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trend_scans_slot_uq").on(t.platform, t.day, t.slot), index("trend_scans_day_idx").on(t.platform, t.day)],
);
