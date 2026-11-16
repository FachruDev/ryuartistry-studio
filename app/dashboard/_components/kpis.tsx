import type { JobStatus } from "@/lib/db/schema";
import type { dashboardSnapshot, navCounts, performanceOverview } from "@/lib/studio/service";
import { countBy } from "./pipeline";
import { Badge, Panel, Stat, fmtDay, usd } from "./ui";

type Snapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;
type Counts = Awaited<ReturnType<typeof navCounts>>;
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

const NUM = new Intl.NumberFormat("id-ID");

/** Asymmetric bento: one hero figure (30-day revenue, both platforms) beside four supporting tiles. */
export function KpiBento({ snapshot, counts, adobe, reels }: { snapshot: Snapshot; counts: Counts; adobe: Perf; reels: Perf }) {
  const active = ACTIVE.reduce((a, s) => a + countBy(snapshot.statusCounts, s), 0);
  const published = countBy(snapshot.statusCounts, "published");
  const waitingOnYou = counts.approvals + counts.adobe + counts.reels;
  const revenue = adobe.totals.revenueUsd + reels.totals.revenueUsd;

  return (
    <div className="rise grid gap-4 md:grid-cols-12" style={{ animationDelay: "80ms" }}>
      <Panel className="md:col-span-6 md:row-span-2" coreClassName="flex h-full min-h-56 flex-col justify-between gap-10 p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">Pendapatan 30 hari</p>
          <Badge tone="accent">
            {fmtDay(adobe.period.start)} – {fmtDay(adobe.period.end)}
          </Badge>
        </div>
        <div>
          <p className="text-6xl font-semibold tracking-[-0.04em] sm:text-7xl">{usd(revenue)}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>Adobe {usd(adobe.totals.revenueUsd)} · {NUM.format(adobe.totals.downloads)} unduhan</span>
            <span>Reels {usd(reels.totals.revenueUsd)} · {NUM.format(reels.totals.views)} tayangan</span>
          </p>
        </div>
      </Panel>
      <div className="md:col-span-3">
        <Stat label="Menunggu kamu" value={waitingOnYou} hint={waitingOnYou ? "approval, upload, posting" : "kosong"} tone={waitingOnYou ? "accent" : "neutral"} />
      </div>
      <div className="md:col-span-3">
        <Stat label="Job aktif" value={active} hint="sedang dikerjakan agen" />
      </div>
      <div className="md:col-span-3">
        <Stat label="Terbit" value={published} hint="diterima platform" tone="success" />
      </div>
      <div className="md:col-span-3">
        <Stat label="Siklus dihentikan" value={counts.halted} hint={counts.halted ? "perlu dicek" : "aman"} tone={counts.halted ? "warn" : "neutral"} />
      </div>
    </div>
  );
}
