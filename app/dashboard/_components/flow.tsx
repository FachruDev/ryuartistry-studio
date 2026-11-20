import type { DayOutcome, FlowStage, StageState } from "@/lib/studio/daily-flow";
import { flowStages } from "@/lib/studio/daily-flow";
import type { getDayFlow, getMonthFlow } from "@/lib/studio/service";
import { Badge, Panel, Section, Stat, type Tone } from "./ui";

type DayFlowData = Awaited<ReturnType<typeof getDayFlow>>;
type MonthFlowData = Awaited<ReturnType<typeof getMonthFlow>>;

const STATE: Record<StageState, { label: string; dot: string; ring: string }> = {
  done: { label: "selesai", dot: "bg-success text-bg", ring: "ring-success/40" },
  active: { label: "berjalan", dot: "bg-accent text-bg", ring: "ring-accent/50" },
  failed: { label: "terhenti", dot: "bg-danger text-bg", ring: "ring-danger/40" },
  waiting: { label: "menunggu", dot: "bg-shell text-subtle ring-1 ring-hairline", ring: "ring-hairline" },
};

export const OUTCOME: Record<DayOutcome, { label: string; tone: Tone; cell: string }> = {
  complete: { label: "tuntas sampai terbit", tone: "success", cell: "bg-success-soft ring-success/40" },
  partial: { label: "sebagian terbit", tone: "accent", cell: "bg-accent-soft ring-accent/40" },
  running: { label: "sedang berjalan", tone: "accent", cell: "bg-core ring-accent/50" },
  stalled: { label: "berhenti sebelum terbit", tone: "warn", cell: "bg-warn-soft ring-warn/40" },
  empty: { label: "tidak ada aktivitas", tone: "neutral", cell: "bg-core ring-hairline" },
};

function Glyph({ state }: { state: StageState }) {
  const p = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (state === "done") return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
  if (state === "failed") return <svg {...p}><path d="M7 7l10 10M17 7 7 17" /></svg>;
  if (state === "active") return <span className="h-2 w-2 animate-pulse rounded-full bg-bg" aria-hidden="true" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-subtle" aria-hidden="true" />;
}

function Step({ s, last }: { s: FlowStage; last: boolean }) {
  const st = STATE[s.state];
  return (
    <li className="relative flex min-w-0 gap-3 lg:flex-1 lg:flex-col lg:gap-3">
      {!last && (
        <span
          aria-hidden="true"
          className={`absolute left-[13px] top-8 h-[calc(100%-1rem)] w-px lg:left-8 lg:top-[13px] lg:h-px lg:w-[calc(100%-2rem)] ${s.state === "done" ? "bg-success/50" : "bg-hairline"}`}
        />
      )}
      <span className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${st.dot}`}>
        <Glyph state={s.state} />
      </span>
      <div className="min-w-0 pb-5 lg:pb-0 lg:pr-2">
        <p className="text-sm font-medium leading-tight">{s.label}</p>
        <p className="mt-0.5 text-xs text-subtle" translate="no">
          {s.who}
        </p>
        <p className="mt-1 text-xs text-muted">
          <span className="sr-only">Status: </span>
          {st.label}
          {s.note && ` · ${s.note}`}
        </p>
      </div>
    </li>
  );
}

export function DayFlowView({ flow, title, delay }: { flow: DayFlowData; title: string; delay?: number }) {
  const o = OUTCOME[flow.outcome];
  return (
    <Section
      eyebrow={`Alur · ${flow.day}`}
      title={title}
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={o.tone}>{o.label}</Badge>
          {flow.cycles > 0 && (
            <Badge>
              {flow.published}/{flow.cycles} siklus terbit
            </Badge>
          )}
        </div>
      }
      delay={delay}
    >
      <Panel coreClassName="p-6 sm:p-8">
        <ol className="flex flex-col lg:flex-row" aria-label="Tahap alur hari ini">
          {flow.stages.map((s, i) => (
            <Step key={s.key} s={s} last={i === flow.stages.length - 1} />
          ))}
        </ol>
      </Panel>
    </Section>
  );
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });

export function monthLabel(month: string) {
  return MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`));
}

/** Month at a glance: each day shows how far the flow got and how many cycles reached publication. */
export function MonthFlowView({
  data,
  selected,
  dayHref,
  nav,
  delay,
}: {
  data: MonthFlowData;
  selected: string;
  dayHref: (day: string) => string;
  nav: { prev: string; next: string | null };
  delay?: number;
}) {
  const total = flowStages(data.platform).length;
  const lead = (new Date(`${data.start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const navCls = "rounded-full px-3 py-1.5 text-sm text-muted ring-1 ring-hairline transition-colors duration-500 ease-fluid hover:bg-shell hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  return (
    <Section
      eyebrow="Ringkasan bulan"
      title={monthLabel(data.month)}
      aside={
        <nav aria-label="Pindah bulan" className="flex gap-2">
          <a href={nav.prev} className={navCls}>
            ← Sebelumnya
          </a>
          {nav.next && (
            <a href={nav.next} className={navCls}>
              Berikutnya →
            </a>
          )}
        </nav>
      }
      delay={delay}
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hari dengan aktivitas" value={data.totals.activeDays} />
        <Stat label="Hari tuntas sampai terbit" value={data.totals.completeDays} tone="success" hint={data.totals.activeDays ? `${Math.round((data.totals.completeDays / data.totals.activeDays) * 100)}% dari hari aktif` : undefined} />
        <Stat label="Siklus dibuka" value={data.totals.cycles} />
        <Stat label="Siklus terbit" value={data.totals.published} />
      </div>
      <Panel coreClassName="p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={`Kalender ${monthLabel(data.month)}`}>
          {WEEKDAYS.map((w) => (
            <p key={w} role="columnheader" className="pb-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              {w}
            </p>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad${i}`} aria-hidden="true" />
          ))}
          {data.days.map((d) => {
            const o = OUTCOME[d.outcome];
            const reached = d.furthest ? flowStages(data.platform).findIndex((s) => s.key === d.furthest) + 1 : 0;
            const isSel = d.day === selected;
            return (
              <a
                key={d.day}
                href={dayHref(d.day)}
                role="gridcell"
                aria-current={isSel ? "date" : undefined}
                aria-label={`${d.day}: ${d.future ? "belum terjadi" : o.label}, ${d.published} dari ${d.cycles} siklus terbit`}
                className={`flex aspect-square min-h-14 flex-col justify-between rounded-2xl p-1.5 ring-1 transition-transform duration-500 ease-fluid hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-2.5 ${
                  d.future ? "bg-transparent opacity-50 ring-hairline" : o.cell
                } ${isSel ? "ring-2 ring-text" : ""}`}
              >
                <span className="text-xs font-medium tabular-nums sm:text-sm">{Number(d.day.slice(8))}</span>
                {!d.future && d.outcome !== "empty" && (
                  <span className="flex flex-col gap-1">
                    <span className="hidden font-mono text-[10px] tabular-nums text-muted sm:block">
                      {d.published}/{d.cycles} terbit
                    </span>
                    <span className="h-1 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
                      <span className="block h-full origin-left rounded-full bg-text/70" style={{ transform: `scaleX(${reached / total})` }} />
                    </span>
                  </span>
                )}
              </a>
            );
          })}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          {(["complete", "partial", "running", "stalled"] as const).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-3 w-3 rounded-[5px] ring-1 ${OUTCOME[k].cell}`} />
              {OUTCOME[k].label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1 w-6 rounded-full bg-text/70" />
            tahap terjauh yang dicapai
          </li>
        </ul>
      </Panel>
    </Section>
  );
}
