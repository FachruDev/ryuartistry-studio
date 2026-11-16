import { connection } from "next/server";
import { Suspense } from "react";
import type { JobStatus } from "@/lib/db/schema";
import { dashboardSnapshot } from "@/lib/studio/service";
import { decidePublicationAction } from "./actions";

export const metadata = { title: "Studio Dashboard" };

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
  { status: "scheduled", label: "Terjadwal", who: "-" },
  { status: "published", label: "Terbit", who: "-" },
  { status: "archived", label: "Dibuang", who: "-" },
];

const PLATFORMS = [
  { id: "adobe_stock", label: "Adobe Stock" },
  { id: "facebook_reels", label: "FB Reels" },
] as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ryuartistry Studio</h1>
        <p className="text-sm text-zinc-500">Status pipeline Rina → Shion → Lukas → Linda → Kechlyn</p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat data…</p>}>
        <DashboardData />
      </Suspense>
    </main>
  );
}

async function DashboardData() {
  await connection();
  const { statusCounts, recent, pending, halted } = await dashboardSnapshot();
  const count = (status: JobStatus, platform: string) =>
    statusCounts.find((c) => c.status === status && c.platform === platform)?.n ?? 0;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-medium">Pipeline</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
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
                <tr key={s.status} className="border-t border-zinc-100 dark:border-zinc-800">
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
      </section>

      {halted.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-amber-600">Siklus dihentikan</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {halted.map((c) => (
              <li key={c.id} className="rounded-lg border border-amber-300 p-3 dark:border-amber-800">
                <span className="font-mono text-xs text-zinc-500">{c.id.slice(0, 8)}</span> · {c.platform} · {c.day}
                <p className="mt-1">{c.haltReason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Menunggu approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">Tidak ada yang menunggu.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map(({ pub, asset, url }) => (
              <article key={pub.id} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                {asset.contentType.startsWith("video/") ? (
                  <video src={url} controls className="max-h-96 w-full rounded bg-black object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned URL from private storage
                  <img src={url} alt={pub.title} className="max-h-96 w-full rounded object-contain" />
                )}
                <div>
                  <h3 className="font-medium">{pub.title}</h3>
                  <p className="text-xs text-zinc-500">
                    {pub.platform} · {asset.width}×{asset.height}
                    {asset.durationSec ? ` · ${asset.durationSec}s` : ""}
                  </p>
                </div>
                {pub.caption && <p className="whitespace-pre-wrap text-sm">{pub.caption}</p>}
                {pub.keywords.length > 0 && (
                  <p className="text-xs text-zinc-500">
                    <span className="font-medium">Keyword ({pub.keywords.length}):</span> {pub.keywords.join(", ")}
                  </p>
                )}
                {pub.hashtags.length > 0 && <p className="text-xs text-zinc-500">{pub.hashtags.join(" ")}</p>}
                <form action={decidePublicationAction} className="flex flex-col gap-2">
                  <input type="hidden" name="publicationId" value={pub.id} />
                  <textarea
                    name="note"
                    placeholder="Catatan (wajib jika ditolak)"
                    className="rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      name="decision"
                      value="approve"
                      className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Setujui
                    </button>
                    <button
                      name="decision"
                      value="reject"
                      className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Tolak → Linda
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Aktivitas terbaru</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
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
                <tr key={j.id} className="border-t border-zinc-100 dark:border-zinc-800">
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
      </section>
    </div>
  );
}
