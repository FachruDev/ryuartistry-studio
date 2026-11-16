import type { JobStatus } from "@/lib/db/schema";
import type { dashboardSnapshot, performanceOverview } from "@/lib/studio/service";
import { countBy } from "./pipeline";
import { Badge, Panel, Stat, usd } from "./ui";

type Snapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;
type Perf = Awaited<ReturnType<typeof performanceOverview>>;

const ACTIVE: JobStatus[] = [
  "idea_pending",
  "idea_review",
  "idea_revision",
  "storyboard_pending",
  "storyboard_review",
  "executing",
  "auto_check",
  "exec_revision",
  "final_review",
  "publish_prep",
];

/** Asymmetric bento: one hero figure (30-day revenue) beside four supporting tiles. */
export function KpiBento({
  snapshot,
  perf,
  kitCount,
  awaitingAdobe,
}: {
  snapshot: Snapshot;
  perf: Perf;
  kitCount: number;
  awaitingAdobe: number;
}) {
  const active = ACTIVE.reduce((a, s) => a + countBy(snapshot.statusCounts, s), 0);
  const published = countBy(snapshot.statusCounts, "published");
  const waitingOnYou = snapshot.pending.length + kitCount + awaitingAdobe;

  return (
    <div className="rise grid gap-4 md:grid-cols-12" style={{ animationDelay: "80ms" }}>
      <Panel className="md:col-span-6 md:row-span-2" coreClassName="flex h-full min-h-56 flex-col justify-between gap-10 p-7">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Pendapatan Adobe Stock, 30 hari</p>
          <Badge tone="accent">{perf.period.start} – {perf.period.end}</Badge>
        </div>
        <div>
          <p className="text-6xl font-semibold tracking-[-0.04em] sm:text-7xl">{usd(perf.totals.revenueUsd)}</p>
          <p className="mt-3 text-sm text-muted">
            {perf.totals.downloads.toLocaleString("id-ID")} unduhan · {perf.top.length} aset menghasilkan
          </p>
        </div>
      </Panel>
      <div className="md:col-span-3">
        <Stat label="Menunggu kamu" value={waitingOnYou} hint={waitingOnYou ? "approval / upload / hasil" : "kosong"} tone={waitingOnYou ? "accent" : "neutral"} />
      </div>
      <div className="md:col-span-3">
        <Stat label="Job aktif" value={active} hint="sedang dikerjakan agen" />
      </div>
      <div className="md:col-span-3">
        <Stat label="Terbit" value={published} hint="diterima platform" tone="success" />
      </div>
      <div className="md:col-span-3">
        <Stat label="Siklus dihentikan" value={snapshot.halted.length} hint={snapshot.halted.length ? "perlu dicek" : "aman"} tone={snapshot.halted.length ? "warn" : "neutral"} />
      </div>
    </div>
  );
}
