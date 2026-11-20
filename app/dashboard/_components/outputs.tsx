import type { OutputItem, OutputKind, OutputRole, summarizeOutputs } from "@/lib/studio/service";
import { Badge, Empty, Panel, PLATFORM_LABEL, dec1, pct, type Tone } from "./ui";

export const ROLE_META: Record<OutputRole, { name: string; job: string; mark: string }> = {
  rina_scout: { name: "Rina-Scout", job: "Pindai tren", mark: "RS" },
  rina: { name: "Rina", job: "Riset mendalam", mark: "R" },
  shion: { name: "Shion", job: "Ide & storyboard", mark: "S" },
  lukas: { name: "Lukas", job: "Review ide", mark: "L" },
  linda: { name: "Linda", job: "Eksekusi aset", mark: "Li" },
  kechlyn: { name: "Kechlyn", job: "Review akhir & metadata", mark: "K" },
};

const KIND_LABEL: Record<OutputKind, string> = {
  trend_scan: "pindaian",
  research_session: "riset",
  report: "laporan",
  idea: "ide",
  storyboard: "storyboard",
  idea_review: "review",
  asset: "aset",
  asset_review: "review aset",
  publication: "metadata",
};

const TIME = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ago = (d: Date | null) => (d ? TIME.format(d) : "belum ada");

export type OutputFilters = { roles: OutputRole[]; all: boolean; platform: "all" | keyof typeof PLATFORM_LABEL; days: number; view: "timeline" | "board" };

export function outputsHref(f: OutputFilters, patch: Partial<OutputFilters>) {
  const n = { ...f, ...patch };
  const q = new URLSearchParams();
  if (!n.all) q.set("agents", n.roles.join(","));
  if (n.platform !== "all") q.set("platform", n.platform);
  if (n.days !== 7) q.set("days", String(n.days));
  if (n.view !== "board") q.set("view", n.view);
  const s = q.toString();
  return `/dashboard/outputs${s ? `?${s}` : ""}`;
}

const chip = (on: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-[background-color,color] duration-500 ease-fluid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    on ? "bg-accent-soft text-text ring-accent/50" : "text-muted ring-hairline hover:bg-shell hover:text-text"
  }`;

function Avatar({ role, size = "md" }: { role: OutputRole; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-core font-semibold ring-1 ring-hairline ${size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"}`}
    >
      {ROLE_META[role].mark}
    </span>
  );
}

/** Agent chips: from "all", a click shows one agent; after that each click adds or removes one. */
export function OutputFilterBar({ f, roles }: { f: OutputFilters; roles: readonly OutputRole[] }) {
  const toggle = (r: OutputRole) => {
    if (f.all) return outputsHref(f, { roles: [r], all: false });
    const next = f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r];
    return next.length ? outputsHref(f, { roles: next, all: false }) : outputsHref(f, { roles: [...roles], all: true });
  };
  const seg = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-[background-color,color] duration-500 ease-fluid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
      on ? "bg-core text-text shadow-[var(--ambient)] ring-1 ring-hairline" : "text-muted hover:text-text"
    }`;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Pilih agen" className="flex flex-wrap gap-2">
        <a href={outputsHref(f, { roles: [...roles], all: true })} aria-current={f.all ? "page" : undefined} className={chip(f.all)}>
          Semua agen
        </a>
        {roles.map((r) => {
          const on = !f.all && f.roles.includes(r);
          return (
            <a key={r} href={toggle(r)} aria-current={on ? "true" : undefined} className={chip(on)}>
              <Avatar role={r} size="sm" />
              <span translate="no">{ROLE_META[r].name}</span>
            </a>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Platform" className="inline-flex rounded-full bg-shell p-1 ring-1 ring-hairline">
          {(["all", "adobe_stock", "facebook_reels"] as const).map((p) => (
            <a key={p} href={outputsHref(f, { platform: p })} aria-current={f.platform === p ? "page" : undefined} className={seg(f.platform === p)}>
              {p === "all" ? "Semua" : PLATFORM_LABEL[p]}
            </a>
          ))}
        </nav>
        <nav aria-label="Rentang waktu" className="inline-flex rounded-full bg-shell p-1 ring-1 ring-hairline">
          {[1, 7, 30].map((d) => (
            <a key={d} href={outputsHref(f, { days: d })} aria-current={f.days === d ? "page" : undefined} className={seg(f.days === d)}>
              {d === 1 ? "Hari ini" : `${d} hari`}
            </a>
          ))}
        </nav>
        <nav aria-label="Tampilan" className="inline-flex rounded-full bg-shell p-1 ring-1 ring-hairline">
          {(["board", "timeline"] as const).map((v) => (
            <a key={v} href={outputsHref(f, { view: v })} aria-current={f.view === v ? "page" : undefined} className={seg(f.view === v)}>
              {v === "board" ? "Per agen" : "Linimasa"}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function OutputSummary({ rows }: { rows: ReturnType<typeof summarizeOutputs> }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {rows.map((r) => (
        <li key={r.role}>
          <Panel coreClassName="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Avatar role={r.role} />
              <div className="min-w-0">
                <p className="text-sm font-medium" translate="no">
                  {ROLE_META[r.role].name}
                </p>
                <p className="truncate text-xs text-subtle">{ROLE_META[r.role].job}</p>
              </div>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{r.count}</p>
            <p className="text-xs text-muted">
              Terakhir {ago(r.lastAt)}
              {r.passRate != null && ` · lolos ${pct(r.passRate)}`}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function scoreTone(i: OutputItem): Tone {
  if (i.passed === true) return "success";
  if (i.passed === false) return "warn";
  return "neutral";
}

export function OutputCard({ item, showAgent = true }: { item: OutputItem; showAgent?: boolean }) {
  return (
    <Panel coreClassName="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showAgent && (
          <span className="flex items-center gap-1.5 font-medium" translate="no">
            <Avatar role={item.role} size="sm" />
            {ROLE_META[item.role].name}
          </span>
        )}
        <Badge>{KIND_LABEL[item.kind]}</Badge>
        <Badge tone="accent">{PLATFORM_LABEL[item.platform]}</Badge>
        {(item.score != null || item.passed != null) && (
          <Badge tone={scoreTone(item)}>{item.score != null ? dec1(item.score) : item.passed ? "lolos" : "gagal"}</Badge>
        )}
        <time className="ml-auto text-subtle" dateTime={item.at.toISOString()}>
          {TIME.format(item.at)}
        </time>
      </div>
      <p className="font-medium leading-snug">{item.title}</p>
      {item.isImage && item.fileUrl && (
        <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, not an optimisable static asset */}
          <img src={item.fileUrl} alt={item.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        </a>
      )}
      {item.summary && <p className="text-sm text-muted">{item.summary}</p>}
      {(item.details.length > 0 || (item.fileUrl && !item.isImage) || item.jobId) && (
        <details className="group text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-accent">Detail</summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-muted">
            {item.details.map((d, i) => (
              <li key={i} className="whitespace-pre-wrap break-words">
                {d}
              </li>
            ))}
            {item.fileUrl && !item.isImage && (
              <li>
                <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                  Buka file video
                </a>
              </li>
            )}
            {item.jobId && <li className="font-mono text-xs text-subtle">job {item.jobId.slice(0, 8)}</li>}
          </ul>
        </details>
      )}
    </Panel>
  );
}

export function OutputTimeline({ items }: { items: OutputItem[] }) {
  if (!items.length) return <Empty>Belum ada hasil kerja di rentang ini.</Empty>;
  return (
    <ol className="mx-auto flex max-w-3xl flex-col gap-3">
      {items.map((i) => (
        <li key={`${i.kind}:${i.id}`}>
          <OutputCard item={i} />
        </li>
      ))}
    </ol>
  );
}

/** One column per agent, side by side, so several agents can be compared at once. */
export function OutputBoard({ items, roles }: { items: OutputItem[]; roles: OutputRole[] }) {
  return (
    <div className={`grid gap-4 ${roles.length === 1 ? "mx-auto max-w-3xl" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {roles.map((r) => {
        const mine = items.filter((i) => i.role === r);
        return (
          <section key={r} aria-label={ROLE_META[r].name} className="flex min-w-0 flex-col gap-3">
            <h3 className="flex items-center gap-2 px-1 text-sm font-medium">
              <Avatar role={r} />
              <span translate="no">{ROLE_META[r].name}</span>
              <span className="text-xs font-normal text-subtle">{ROLE_META[r].job}</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-subtle">{mine.length}</span>
            </h3>
            {mine.length === 0 ? (
              <p className="rounded-2xl px-4 py-6 text-center text-sm text-muted ring-1 ring-hairline">Belum ada hasil.</p>
            ) : (
              mine.slice(0, 30).map((i) => <OutputCard key={`${i.kind}:${i.id}`} item={i} showAgent={false} />)
            )}
          </section>
        );
      })}
    </div>
  );
}
