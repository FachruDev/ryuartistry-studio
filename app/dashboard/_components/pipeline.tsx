import type { JobStatus } from "@/lib/db/schema";
import type { dashboardSnapshot } from "@/lib/studio/service";
import { Section, row, tableWrap, thead } from "./ui";

type Snapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;

const STATUS_ORDER: { status: JobStatus; label: string; who: string }[] = [
  { status: "idea_pending", label: "Menunggu ide", who: "Shion" },
  { status: "idea_review", label: "Review ide", who: "Lukas" },
  { status: "idea_revision", label: "Revisi ide", who: "Shion" },
  { status: "storyboard_pending", label: "Storyboard", who: "Shion" },
  { status: "storyboard_review", label: "Review storyboard", who: "Lukas" },
  { status: "executing", label: "Eksekusi", who: "Linda" },
  { status: "exec_revision", label: "Revisi eksekusi", who: "Linda" },
  { status: "final_review", label: "Review akhir", who: "Kechlyn" },
  { status: "publish_prep", label: "Siap publikasi", who: "Kechlyn" },
  { status: "awaiting_approval", label: "Menunggu approval", who: "Kamu" },
  { status: "scheduled", label: "Disetujui / diupload", who: "Kamu" },
  { status: "published", label: "Terbit", who: "-" },
  { status: "archived", label: "Dibuang", who: "-" },
];

const PLATFORMS = [
  { id: "adobe_stock", label: "Adobe Stock" },
  { id: "facebook_reels", label: "FB Reels" },
] as const;

export function PipelineTable({ statusCounts }: { statusCounts: Snapshot["statusCounts"] }) {
  const count = (status: JobStatus, platform: string) =>
    statusCounts.find((c) => c.status === status && c.platform === platform)?.n ?? 0;
  return (
    <Section title="Pipeline">
      <div className={tableWrap}>
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 font-medium">Tahap</th>
              <th className="px-3 py-2 font-medium">Pemegang</th>
              {PLATFORMS.map((p) => (
                <th key={p.id} className="px-3 py-2 text-right font-medium">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATUS_ORDER.map((s) => (
              <tr key={s.status} className={row}>
                <td className="px-3 py-2">{s.label}</td>
                <td className="px-3 py-2 text-zinc-500">{s.who}</td>
                {PLATFORMS.map((p) => (
                  <td key={p.id} className="px-3 py-2 text-right tabular-nums">
                    {count(s.status, p.id) || <span className="text-zinc-300 dark:text-zinc-700">0</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function HaltedCycles({ halted }: { halted: Snapshot["halted"] }) {
  if (!halted.length) return null;
  return (
    <Section title="Siklus dihentikan" tone="warn">
      <ul className="flex flex-col gap-2 text-sm">
        {halted.map((c) => (
          <li key={c.id} className="rounded-lg border border-amber-300 p-3 dark:border-amber-800">
            <span className="font-mono text-xs text-zinc-500">{c.id.slice(0, 8)}</span> · {c.platform} · {c.day}
            <p className="mt-1">{c.haltReason}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RecentActivity({ recent }: { recent: Snapshot["recent"] }) {
  return (
    <Section title="Aktivitas terbaru">
      <div className={tableWrap}>
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Revisi ide / eksekusi</th>
              <th className="px-3 py-2 text-right font-medium">Skor ide</th>
              <th className="px-3 py-2 font-medium">Diperbarui</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">
                  Belum ada job.
                </td>
              </tr>
            )}
            {recent.map((j) => (
              <tr key={j.id} className={row}>
                <td className="px-3 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                <td className="px-3 py-2">{j.platform}</td>
                <td className="px-3 py-2">
                  {j.status}
                  {j.archiveReason && <span className="block text-xs text-zinc-500">{j.archiveReason}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {j.ideaRevisionCount} / {j.execRevisionCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{j.lastIdeaScore ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {j.updatedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
