/** Phase 4 tables: operator settings, agent activity, and in-app notifications. */
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./schema";

/** One row per setting key; values are validated in lib/studio/automation-settings.ts. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every MCP tool call, for heartbeats and the agents page. */
export const agentActivity = pgTable(
  "agent_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_activity_agent_idx").on(t.agentId, t.createdAt)],
);

export const notificationSeverity = pgEnum("notification_severity", ["info", "warn", "critical"]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable key so the same problem is reported once until it is resolved (e.g. "stale:job:<id>"). */
    dedupeKey: text("dedupe_key").notNull().unique(),
    severity: notificationSeverity("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Dashboard path to act on it. */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_unread_idx").on(t.readAt, t.createdAt)],
);
