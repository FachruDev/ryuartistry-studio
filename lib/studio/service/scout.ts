/** Rina-Scout trend scans: quick daily signals that feed Rina's deep research. */
import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Platform } from "@/lib/db/schema";
import { trendScans, type TrendSignal } from "@/lib/db/schema-scout";
import { addDays, studioToday } from "../research-periods";
import { StudioError, type Agent } from "./core";

export async function submitTrendScan(
  agent: Agent,
  input: { platform: Platform; day: string; slot: number; model: string; notes?: string; signals: TrendSignal[] },
) {
  const today = studioToday();
  if (input.day > today || input.day < addDays(today, -1)) {
    throw new StudioError(`Pindaian hanya untuk hari ini (${today}) atau kemarin.`);
  }
  const [dup] = await db
    .select({ id: trendScans.id })
    .from(trendScans)
    .where(and(eq(trendScans.platform, input.platform), eq(trendScans.day, input.day), eq(trendScans.slot, input.slot)));
  if (dup) {
    throw new StudioError(`Pindaian ${input.platform} ${input.day} slot ${input.slot} sudah ada. Cek get_research_schedule untuk slot yang belum dipindai.`);
  }
  const [row] = await db
    .insert(trendScans)
    .values({ ...input, agentId: agent.id })
    .returning({ id: trendScans.id });
  return { scanId: row.id, signals: input.signals.length };
}

export async function listTrendScans(platform: Platform, from: string, to = from) {
  return db
    .select()
    .from(trendScans)
    .where(and(eq(trendScans.platform, platform), between(trendScans.day, from, to)))
    .orderBy(asc(trendScans.day), asc(trendScans.slot));
}
