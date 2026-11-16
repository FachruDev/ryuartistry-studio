import type { calibrationStats } from "@/lib/studio/service";
import { Badge, Panel, Section, pct } from "./ui";

type Stats = Awaited<ReturnType<typeof calibrationStats>>;

function Meter({ label, value, display, target, ok }: { label: string; value: number; display: string; target: string; ok: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Badge tone={ok ? "success" : "neutral"}>{ok ? "tercapai" : `target ${target}`}</Badge>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{display}</p>
      {/* Track is a lighter step of the fill's own hue, so the state reads across the whole bar. */}
      <div className={`h-1.5 overflow-hidden rounded-full ${ok ? "bg-success-soft" : "bg-accent-soft"}`} aria-hidden="true">
        <div
          className={`h-full origin-left rounded-full transition-transform duration-700 ease-fluid ${ok ? "bg-success" : "bg-accent"}`}
          style={{ transform: `scaleX(${value > 0 ? Math.max(0.02, Math.min(1, value)) : 0})` }}
        />
      </div>
    </div>
  );
}

export function Calibration({ stats, delay }: { stats: Stats; delay?: number }) {
  const c = stats.criteria;
  const bias = stats.meanBias;
  const verdict =
    bias == null
      ? "Belum ada pasangan skor. Beri skor saat menyetujui atau menolak."
      : Math.abs(bias) < 0.5
        ? "Skor Kechlyn sejalan dengan penilaianmu."
        : bias > 0
          ? `Kechlyn rata-rata ${bias.toFixed(2)} poin lebih murah hati darimu. Pertimbangkan memperketat rubrik asset-image.`
          : `Kechlyn rata-rata ${Math.abs(bias).toFixed(2)} poin lebih ketat darimu.`;

  return (
    <Section
      eyebrow="Kalibrasi"
      title="Seberapa bisa Kechlyn dipercaya"
      aside={<Badge tone={stats.readyForAutoMode ? "success" : "neutral"}>{stats.readyForAutoMode ? "Siap mode otomatis" : "Approval manual"}</Badge>}
      delay={delay}
    >
      <Panel coreClassName="p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-3">
          <Meter
            label="Sudah kamu nilai"
            value={stats.reviewed / c.minHumanReviewed}
            display={`${stats.reviewed} / ${c.minHumanReviewed}`}
            target={`≥ ${c.minHumanReviewed}`}
            ok={stats.reviewed >= c.minHumanReviewed}
          />
          <Meter
            label="Kamu setujui"
            value={stats.approvalRate ?? 0}
            display={pct(stats.approvalRate)}
            target={`≥ ${pct(c.minHumanApprovalRate)}`}
            ok={(stats.approvalRate ?? 0) >= c.minHumanApprovalRate}
          />
          <Meter
            label={`Diterima Adobe (${stats.platformDecided})`}
            value={stats.acceptanceRate ?? 0}
            display={pct(stats.acceptanceRate)}
            target={`≥ ${pct(c.minPlatformAcceptanceRate)}`}
            ok={(stats.acceptanceRate ?? 0) >= c.minPlatformAcceptanceRate}
          />
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{verdict}</p>
          <p className="font-mono text-xs text-subtle">
            selisih rata-rata {stats.meanAbsDiff == null ? "–" : stats.meanAbsDiff.toFixed(2)} · {stats.scoredPairs} pasang
          </p>
        </div>
      </Panel>
    </Section>
  );
}
