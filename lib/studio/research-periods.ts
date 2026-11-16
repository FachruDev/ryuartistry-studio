/**
 * Calendar helpers for Rina's schedule. All dates are plain "YYYY-MM-DD" strings in the
 * studio time zone (Asia/Jakarta), so a "day" means the same thing to every agent.
 */
export const STUDIO_TIME_ZONE = "Asia/Jakarta";

export type ReportLevel = "daily" | "weekly" | "monthly" | "yearly";
export type Period = { start: string; end: string };

/** Research slots: 1 = morning (00-11), 2 = midday (12-17), 3 = evening (18-23), studio time. */
export const SLOT_HOURS = [
  { slot: 1, from: 0, to: 11, label: "pagi" },
  { slot: 2, from: 12, to: 17, label: "siang" },
  { slot: 3, from: 18, to: 23, label: "malam" },
] as const;

function parts(now: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function studioToday(now = new Date()): string {
  return parts(now).day;
}

export function currentSlot(now = new Date()): 1 | 2 | 3 {
  const h = parts(now).hour;
  return (SLOT_HOURS.find((s) => h >= s.from && h <= s.to)?.slot ?? 3) as 1 | 2 | 3;
}

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(day: string): number {
  return (toDate(day).getUTCDay() + 6) % 7;
}

/** The report period of `level` that contains `day`. Weeks run Monday-Sunday. */
export function periodOf(level: ReportLevel, day: string): Period {
  const d = toDate(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (level) {
    case "daily":
      return { start: day, end: day };
    case "weekly": {
      const start = addDays(day, -weekdayIndex(day));
      return { start, end: addDays(start, 6) };
    }
    case "monthly":
      return { start: toDay(new Date(Date.UTC(y, m, 1))), end: toDay(new Date(Date.UTC(y, m + 1, 0))) };
    case "yearly":
      return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
}

/** The period just before the one containing `day`. */
export function previousPeriod(level: ReportLevel, day: string): Period {
  return periodOf(level, addDays(periodOf(level, day).start, -1));
}

export function isExactPeriod(level: ReportLevel, p: Period): boolean {
  const expected = periodOf(level, p.start);
  return expected.start === p.start && expected.end === p.end;
}

/** Level a rollup is built from. */
export const CHILD_LEVEL: Record<Exclude<ReportLevel, "daily">, ReportLevel> = {
  weekly: "daily",
  monthly: "weekly",
  yearly: "monthly",
};

/** Two periods overlap (inclusive). Weeks can straddle month boundaries. */
export function overlaps(a: Period, b: Period): boolean {
  return a.start <= b.end && b.start <= a.end;
}
