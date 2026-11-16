import type { calibrationStats } from "@/lib/studio/service";
import { Section, pct } from "./ui";

type Stats = Awaited<ReturnType<typeof calibrationStats>>;

function Stat({ label, value, target, ok }: { label: string; value: string; target?: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {value}
        {ok !== undefined && (
          <span className={`ml-2 text-xs font-normal ${ok ? "text-emerald-600" : "text-zinc-500"}`}>
            {ok ? "tercapai" : "belum"}
          </span>
        )}
      </p>
      {target && <p className="text-xs text-zinc-500">target {target}</p>}
    </div>
  );
}

export function Calibration({ stats }: { stats: Stats }) {
  const c = stats.criteria;
  const bias = stats.meanBias;
  return (
    <Section title="Kalibrasi rubrik Kechlyn (Adobe Stock)">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Sudah kamu nilai"
          value={String(stats.reviewed)}
          target={`≥ ${c.minHumanReviewed}`}
          ok={stats.reviewed >= c.minHumanReviewed}
        />
        <Stat
          label="Kamu setujui"
          value={pct(stats.approvalRate)}
          target={`≥ ${pct(c.minHumanApprovalRate)}`}
          ok={(stats.approvalRate ?? 0) >= c.minHumanApprovalRate}
        />
        <Stat
          label={`Diterima Adobe (${stats.platformDecided} diputuskan)`}
          value={pct(stats.acceptanceRate)}
          target={`≥ ${pct(c.minPlatformAcceptanceRate)}`}
          ok={(stats.acceptanceRate ?? 0) >= c.minPlatformAcceptanceRate}
        />
        <Stat
          label={`Selisih skor Kechlyn vs kamu (${stats.scoredPairs} pasang)`}
          value={stats.meanAbsDiff == null ? "-" : stats.meanAbsDiff.toFixed(2)}
        />
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {bias == null
          ? "Belum ada pasangan skor."
          : Math.abs(bias) < 0.5
            ? "Skor Kechlyn sejalan dengan penilaianmu."
            : bias > 0
              ? `Kechlyn rata-rata ${bias.toFixed(2)} poin lebih murah hati darimu; pertimbangkan memperketat rubrik asset-image.`
              : `Kechlyn rata-rata ${Math.abs(bias).toFixed(2)} poin lebih ketat darimu.`}{" "}
        {stats.readyForAutoMode
          ? "Semua syarat publikasi otomatis tercapai."
          : "Publikasi tetap butuh approval manusia sampai semua target tercapai."}
      </p>
    </Section>
  );
}
