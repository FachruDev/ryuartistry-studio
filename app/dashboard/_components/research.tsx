import type { getResearchSchedule, getRollupData, listResearch } from "@/lib/studio/service";
import type { TopicWithTrend, Trend } from "@/lib/studio/research-rollup";
import { Badge, Empty, Panel, Section, dec1, fmtDay, table, type Tone } from "./ui";

type Schedule = Awaited<ReturnType<typeof getResearchSchedule>>;
type Rollup = Awaited<ReturnType<typeof getRollupData>>;
type Reports = Awaited<ReturnType<typeof listResearch>>;

const DUE_LABEL = (d: Schedule["due"][number]) =>
  d.action === "research_session"
    ? `Sesi riset slot ${d.slot} (${d.day})${d.overdue ? ", terlambat" : ""}`
    : d.action === "publish_daily"
      ? `Laporan harian ${d.day}`
      : `Rollup ${d.level} ${fmtDay(d.period.start)} – ${fmtDay(d.period.end)}`;

export function ScheduleToday({ schedule, delay }: { schedule: Schedule; delay?: number }) {
  return (
    <Section
      eyebrow={`Hari ini · ${fmtDay(schedule.today)} · WIB`}
      title="Jadwal riset Rina"
      aside={<Badge tone={schedule.due.length ? "warn" : "success"}>{schedule.due.length ? `${schedule.due.length} jatuh tempo` : "semua beres"}</Badge>}
      delay={delay}
    >
      <div className="grid gap-4 md:grid-cols-12">
        {schedule.slots.map((s) => {
          const current = s.slot === schedule.currentSlot;
          const done = s.models.length > 0;
          return (
            <Panel key={s.slot} className="md:col-span-3" coreClassName={`flex h-full flex-col justify-between gap-6 p-5 ${current ? "ring-1 ring-accent/40" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">
                  Slot {s.slot} · {s.label}
                </p>
                {current && <Badge tone="accent">sekarang</Badge>}
              </div>
              <div>
                <p className="text-sm text-subtle">
                  {String(s.from).padStart(2, "0")}:00 – {String(s.to).padStart(2, "0")}:59
                </p>
                <p className="mt-1 text-lg font-medium">{done ? s.models.join(" + ") : "belum ada sesi"}</p>
              </div>
              <Badge tone={done ? "success" : s.slot < schedule.currentSlot ? "warn" : "neutral"}>
                {done ? "selesai" : s.slot < schedule.currentSlot ? "terlewat" : "menunggu"}
              </Badge>
            </Panel>
          );
        })}
        <Panel className="md:col-span-3" coreClassName="flex h-full flex-col gap-3 p-5">
          <p className="text-sm text-muted">Yang harus dikerjakan</p>
          {schedule.due.length === 0 ? (
            <p className="text-sm">Tidak ada. Rina sudah sesuai jadwal.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {schedule.due.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
                  {DUE_LABEL(d)}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Section>
  );
}

type Opportunity = { topic?: string; keywords?: string[]; rationale?: string; priority?: number; suggested_style?: string };

export function LatestDaily({ report, delay }: { report: Reports[number] | undefined; delay?: number }) {
  return (
    <Section eyebrow="Untuk Shion" title="Laporan harian terbaru" aside={report && <Badge>{fmtDay(report.periodStart)}</Badge>} delay={delay}>
      {!report ? (
        <Empty>Belum ada laporan harian. Laporan pertama akan membuka siklus produksi.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-5" coreClassName="p-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{report.summary}</p>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {(report.opportunities as Opportunity[]).slice(0, 6).map((o, i) => (
              <Panel key={i} coreClassName="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{o.topic ?? "Tanpa judul"}</p>
                  {o.priority != null && <Badge tone={o.priority >= 8 ? "accent" : "neutral"}>P{o.priority}</Badge>}
                </div>
                {o.rationale && <p className="text-sm text-muted">{o.rationale}</p>}
                {o.keywords && <p className="mt-auto text-xs text-subtle">{o.keywords.slice(0, 6).join(" · ")}</p>}
              </Panel>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

const TREND: Record<Trend, { label: string; tone: Tone }> = {
  new: { label: "baru", tone: "accent" },
  up: { label: "naik", tone: "success" },
  down: { label: "turun", tone: "warn" },
  stable: { label: "stabil", tone: "neutral" },
};

/** Opportunity score shown as a number plus a thin magnitude bar (one hue, lighter track). */
function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-accent-soft sm:block" aria-hidden="true">
        <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${Math.min(1, value / 10)})` }} />
      </div>
      <span className="w-10 text-right font-mono tabular-nums">{dec1(value)}</span>
    </div>
  );
}

export function WeekTopics({ rollup, delay }: { rollup: Rollup; delay?: number }) {
  const topics: TopicWithTrend[] = rollup.topics.slice(0, 15);
  return (
    <Section
      eyebrow={`Minggu ini · ${fmtDay(rollup.period.start)} – ${fmtDay(rollup.period.end)}`}
      title="Topik peluang"
      aside={<Badge>{rollup.children.length} laporan harian</Badge>}
      delay={delay}
    >
      {topics.length === 0 ? (
        <Empty>Belum ada temuan minggu ini.</Empty>
      ) : (
        <Panel coreClassName="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Topik riset minggu ini, diurutkan dari skor peluang tertinggi</caption>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Topik</th>
                <th className={table.th}>Tren</th>
                <th className={`${table.th} text-right`}>Permintaan</th>
                <th className={`${table.th} text-right`}>Persaingan</th>
                <th className={`${table.th} text-right`}>Sesi / model</th>
                <th className={`${table.th} text-right`}>Skor peluang</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.key} className={table.row}>
                  <td className={table.td}>
                    <span className="font-medium">{t.topic}</span>
                    {!t.verified && <span className="ml-2 text-xs text-warn">tanpa sumber</span>}
                    <span className="mt-0.5 block text-xs text-subtle">{t.keywords.slice(0, 5).join(" · ")}</span>
                  </td>
                  <td className={table.td}>
                    <Badge tone={TREND[t.trend].tone}>
                      {TREND[t.trend].label}
                      {t.delta != null && t.trend !== "stable" ? ` ${t.delta > 0 ? "+" : ""}${t.delta}` : ""}
                    </Badge>
                  </td>
                  <td className={`${table.td} text-right font-mono tabular-nums`}>{dec1(t.avgDemand)}</td>
                  <td className={`${table.td} text-right font-mono tabular-nums`}>{dec1(t.avgCompetition)}</td>
                  <td className={`${table.td} text-right font-mono tabular-nums`}>
                    {t.sessions} / {t.models}
                  </td>
                  <td className={table.td}>
                    <ScoreBar value={t.opportunityScore} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Section>
  );
}

export function ReportHistory({ reports, delay }: { reports: Reports; delay?: number }) {
  return (
    <Section eyebrow="Arsip" title="Rollup mingguan, bulanan, tahunan" delay={delay}>
      {reports.length === 0 ? (
        <Empty>Belum ada rollup. Rollup mingguan pertama jatuh tempo setelah minggu riset pertama selesai.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <Panel key={r.id} coreClassName="flex h-full flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <Badge tone="accent">{r.level}</Badge>
                <p className="font-mono text-xs text-subtle">
                  {fmtDay(r.periodStart)} – {fmtDay(r.periodEnd)}
                </p>
              </div>
              <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{r.summary}</p>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
