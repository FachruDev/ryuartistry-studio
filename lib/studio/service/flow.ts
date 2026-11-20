/** Daily flow (scan → research → ideas → … → published) per day and per month, from the database. */
import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cycles, jobs, researchReports, researchSessions, transitions, type JobStatus, type Platform } from "@/lib/db/schema";
import { trendScans } from "@/lib/db/schema-scout";
import { computeDayFlow, type DayFacts, type DayFlow } from "../daily-flow";
import { addDays, studioToday } from "../research-periods";

async function factsBetween(platform: Platform, start: string, end: string): Promise<Map<string, Omit<DayFacts, "dayClosed">>> {
  const [scans, sessions, reports, cycleRows] = await Promise.all([
    db
      .select({ day: trendScans.day, n: sql<number>`count(*)::int` })
      .from(trendScans)
      .where(and(eq(trendScans.platform, platform), between(trendScans.day, start, end)))
      .groupBy(trendScans.day),
    db
      .select({ day: researchSessions.day, n: sql<number>`count(*)::int` })
      .from(researchSessions)
      .where(and(eq(researchSessions.platform, platform), between(researchSessions.day, start, end)))
      .groupBy(researchSessions.day),
    db
      .select({ day: researchReports.periodStart })
      .from(researchReports)
      .where(and(eq(researchReports.platform, platform), eq(researchReports.level, "daily"), between(researchReports.periodStart, start, end))),
    db
      .select({ id: cycles.id, day: cycles.day })
      .from(cycles)
      .where(and(eq(cycles.platform, platform), between(cycles.day, start, end))),
  ]);

  const jobRows = cycleRows.length
    ? await db
        .select({ id: jobs.id, cycleId: jobs.cycleId, status: jobs.status })
        .from(jobs)
        .where(inArray(jobs.cycleId, cycleRows.map((c) => c.id)))
    : [];
  const visitedRows = jobRows.length
    ? await db
        .selectDistinct({ jobId: transitions.jobId, status: transitions.toStatus })
        .from(transitions)
        .where(inArray(transitions.jobId, jobRows.map((j) => j.id)))
    : [];
  const visited = new Map<string, JobStatus[]>();
  for (const v of visitedRows) visited.set(v.jobId, [...(visited.get(v.jobId) ?? []), v.status]);
  const cycleDay = new Map(cycleRows.map((c) => [c.id, c.day]));

  const out = new Map<string, Omit<DayFacts, "dayClosed">>();
  const day = (d: string) => {
    if (!out.has(d)) out.set(d, { scans: 0, researchSessions: 0, dailyReport: false, cycles: 0, jobs: [] });
    return out.get(d)!;
  };
  for (const s of scans) day(s.day).scans = s.n;
  for (const s of sessions) day(s.day).researchSessions = s.n;
  for (const r of reports) day(r.day).dailyReport = true;
  for (const c of cycleRows) day(c.day).cycles++;
  for (const j of jobRows) day(cycleDay.get(j.cycleId)!).jobs.push({ status: j.status, visited: visited.get(j.id) ?? [] });
  return out;
}

const EMPTY: Omit<DayFacts, "dayClosed"> = { scans: 0, researchSessions: 0, dailyReport: false, cycles: 0, jobs: [] };

export async function getDayFlow(platform: Platform, day: string, now = new Date()) {
  const facts = (await factsBetween(platform, day, day)).get(day) ?? EMPTY;
  return { platform, day, ...computeDayFlow(platform, { ...facts, dayClosed: day < studioToday(now) }) };
}

/** Every day of a calendar month ("YYYY-MM"), with the flow summary of each. */
export async function getMonthFlow(platform: Platform, month: string, now = new Date()) {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = studioToday(now);
  const facts = await factsBetween(platform, start, end);

  const days: (DayFlow & { day: string; future: boolean })[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({ day: d, future: d > today, ...computeDayFlow(platform, { ...(facts.get(d) ?? EMPTY), dayClosed: d < today }) });
  }
  const past = days.filter((d) => !d.future);
  return {
    platform,
    month,
    start,
    end,
    days,
    totals: {
      cycles: past.reduce((a, d) => a + d.cycles, 0),
      published: past.reduce((a, d) => a + d.published, 0),
      completeDays: past.filter((d) => d.outcome === "complete").length,
      activeDays: past.filter((d) => d.outcome !== "empty").length,
    },
  };
}

export function parseMonth(v: unknown, now = new Date()): string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : studioToday(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
