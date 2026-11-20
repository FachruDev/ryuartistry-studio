/**
 * Agent triggers: the studio wakes an agent itself by POSTing a signed webhook (Standard Webhooks:
 * Grok Automations, n8n, Make, Zapier...) at the run times set per agent, instead of relying on a
 * schedule inside the AI app. The signing secret is stored encrypted (lib/secret-box.ts).
 */
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agentRole } from "./schema";

export const agentTriggers = pgTable(
  "agent_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: agentRole("role").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    url: text("url").notNull(),
    /** AES-GCM encrypted signing secret (e.g. Grok's whsec_...), or null to send unsigned. */
    secretEnc: text("secret_enc"),
    /** Run times in studio time (WIB), "HH:MM". */
    times: text("times").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_triggers_role_uq").on(t.role)],
);

export const triggerRunStatus = pgEnum("trigger_run_status", ["sent", "failed", "skipped"]);

export const agentTriggerRuns = pgTable(
  "agent_trigger_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: agentRole("role").notNull(),
    /** "<role>:<day>:<HH:MM>" or "<role>:test:<ts>"; one run per scheduled time. */
    runKey: text("run_key").notNull(),
    status: triggerRunStatus("status").notNull(),
    httpStatus: integer("http_status"),
    detail: text("detail"),
    due: jsonb("due").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_trigger_runs_key_uq").on(t.runKey), index("agent_trigger_runs_role_idx").on(t.role, t.createdAt)],
);
