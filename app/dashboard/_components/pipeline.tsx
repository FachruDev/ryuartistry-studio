import type { JobStatus } from "@/lib/db/schema";
import type { dashboardSnapshot } from "@/lib/studio/service";
import { Badge, Panel, Section, fmtDay, table, type Tone } from "./ui";

type Snapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;

const STAGES: { status: JobStatus; label: string; who: string }[] = [
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
  { status: "published", label: "Terbit", who: "–" },
  { status: "archived", label: "Dibuang", who: "–" },
];

const STATUS_TONE: Partial<Record<JobStatus, Tone>> = {
  published: "success",
  archived: "neutral",
  halted: "warn",
  awaiting_approval: "accent",
};

export function countBy(statusCounts: Snapshot["statusCounts"], status: JobStatus, platform?: string) {
  return statusCounts
    .filter((c) => c.status === status && (!platform || c.platform === platform))
    .reduce((a, c) => a + c.n, 0);
}

export function PipelineTable({ statusCounts, delay }: { statusCounts: Snapshot["statusCounts"]; delay?: number }) {
  return (
    <Section eyebrow="Alur kerja" title="Pipeline per tahap" delay={delay}>
      <Panel coreClassName="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={table.head}>
            <tr>
              <th className={table.th}>Tahap</th>
              <th className={table.th}>Pemegang</th>
              <th className={`${table.th} text-right`}>Adobe Stock</th>
              <th className={`${table.th} text-right`}>FB Reels</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.status} className={table.row}>
                <td className={table.td}>{s.label}</td>
                <td className={`${table.td} text-muted`}>{s.who}</td>
                {(["adobe_stock", "facebook_reels"] as const).map((p) => {
                  const n = countBy(statusCounts, s.status, p);
                  return (
                    <td key={p} className={`${table.td} text-right font-mono tabular-nums ${n ? "text-text" : "text-subtle"}`}>
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Section>
  );
}

export function HaltedCycles({ halted }: { halted: Snapshot["halted"] }) {
  if (!halted.length) return null;
  return (
    <Section eyebrow="Perlu perhatian" title="Siklus dihentikan">
      <div className="flex flex-col gap-3">
        {halted.map((c) => (
          <Panel key={c.id} coreClassName="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-4">
            <Badge tone="warn">dihentikan</Badge>
            <p className="flex-1 text-sm">{c.haltReason}</p>
            <p className="font-mono text-xs text-subtle">
              {c.platform} · {fmtDay(c.day)} · {c.id.slice(0, 8)}
            </p>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

export function RecentActivity({ recent, delay }: { recent: Snapshot["recent"]; delay?: number }) {
  return (
    <Section eyebrow="Log" title="Aktivitas terbaru" delay={delay}>
      <Panel coreClassName="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={table.head}>
            <tr>
              <th className={table.th}>Job</th>
              <th className={table.th}>Status</th>
              <th className={`${table.th} text-right`}>Revisi ide / eksekusi</th>
              <th className={`${table.th} text-right`}>Skor ide</th>
              <th className={table.th}>Diperbarui</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted">
                  Belum ada job. Siklus dibuka otomatis saat Rina menerbitkan laporan harian.
                </td>
              </tr>
            )}
            {recent.map((j) => (
              <tr key={j.id} className={table.row}>
                <td className={table.td}>
                  <span className="font-mono text-xs">{j.id.slice(0, 8)}</span>
                  <span className="mt-0.5 block text-xs text-subtle">{j.platform === "adobe_stock" ? "Adobe Stock" : "FB Reels"}</span>
                </td>
                <td className={table.td}>
                  <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>{j.status}</Badge>
                  {j.archiveReason && <span className="mt-1 block max-w-md text-xs text-muted">{j.archiveReason}</span>}
                </td>
                <td className={`${table.td} text-right font-mono tabular-nums`}>
                  {j.ideaRevisionCount} / {j.execRevisionCount}
                </td>
                <td className={`${table.td} text-right font-mono tabular-nums`}>{j.lastIdeaScore ?? "–"}</td>
                <td className={`${table.td} text-xs text-muted`}>
                  {j.updatedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Section>
  );
}
