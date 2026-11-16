import { connection } from "next/server";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AGENT_KITS, CRON_HINT } from "@/lib/studio/agent-kit";
import { agentsOverview, lastTickAt } from "@/lib/studio/service";
import { RotateTokenForm, RunTickButton } from "../_components/automation-forms";
import { CopyText } from "../_components/reels-forms";
import { Badge, PageHeader, Panel, Section, fmtDate, type Tone } from "../_components/ui";

export const metadata = { title: "Agen · Ryuartistry Studio" };

const HEALTH: Record<string, { label: string; tone: Tone }> = {
  active: { label: "aktif", tone: "success" },
  quiet: { label: "tidak aktif", tone: "warn" },
  never: { label: "belum terhubung", tone: "neutral" },
};

const TIME = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

function seen(d: Date | null): string {
  if (!d) return "belum pernah";
  return `${fmtDate(d)}, ${TIME.format(d)} WIB`;
}

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Otomasi · Agen"
        title="Agen & koneksi"
        description="Setiap agen berjalan di aplikasi chat-nya sendiri dengan jadwal (scheduled task) dan terhubung ke server MCP studio. Di sini kamu melihat siapa yang aktif dan menyalin kit koneksinya."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat agen…</p>}>
        <AgentsData />
      </Suspense>
    </>
  );
}

async function AgentsData() {
  await connection();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const mcpUrl = `${origin}/api/mcp`;
  const [agents, tick] = await Promise.all([agentsOverview(), lastTickAt()]);
  const team = agents.filter((a) => a.role !== "admin");

  return (
    <div className="flex flex-col gap-16">
      <Section eyebrow="Status" title="Tim agen" delay={80}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {team.map((a) => {
            const kit = AGENT_KITS[a.role as keyof typeof AGENT_KITS];
            const health = HEALTH[a.health];
            return (
              <Panel key={a.id} coreClassName="flex h-full flex-col gap-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-text text-sm font-semibold text-bg">
                      {a.name[0]}
                    </span>
                    <div>
                      <p className="font-semibold" translate="no">
                        {a.name}
                      </p>
                      <p className="text-xs text-subtle">{a.model}</p>
                    </div>
                  </div>
                  <Badge tone={health.tone}>{health.label}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-subtle">Terakhir aktif</dt>
                    <dd className="mt-0.5">{seen(a.lastSeenAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Panggilan hari ini</dt>
                    <dd className="mt-0.5 font-mono tabular-nums">{a.callsToday}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Tool terakhir</dt>
                    <dd className="mt-0.5 truncate font-mono text-xs">{a.lastTool?.tool ?? "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Antrian</dt>
                    <dd className="mt-0.5 font-mono tabular-nums">{a.queue ?? "jadwal riset"}</dd>
                  </div>
                </dl>
                {kit && (
                  <details className="group mt-auto rounded-2xl bg-core-muted ring-1 ring-hairline">
                    <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 text-sm font-medium transition-colors hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                      Kit koneksi
                      <span className="ml-2 text-xs font-normal text-subtle">{kit.schedule}</span>
                    </summary>
                    <div className="flex flex-col gap-4 px-4 pb-4 pt-1 text-sm">
                      <p className="text-muted">
                        <span className="text-text">Aplikasi:</span> {kit.app}
                      </p>
                      <div>
                        <p className="mb-1.5 text-xs text-subtle">URL server MCP (header Authorization: Bearer &lt;token {a.name}&gt;)</p>
                        <CopyText text={mcpUrl} label={`URL MCP untuk ${a.name}`} copyLabel="Salin URL" rows={1} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-subtle">Prompt terjadwal</p>
                        <CopyText text={kit.prompt} label={`Prompt terjadwal ${a.name}`} copyLabel="Salin prompt" rows={6} />
                      </div>
                      <RotateTokenForm agentId={a.id} name={a.name} />
                    </div>
                  </details>
                )}
              </Panel>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Penjadwal server" title="Pengecekan otomatis (cron)" delay={160}>
        <Panel coreClassName="grid gap-6 p-6 md:grid-cols-12">
          <div className="flex flex-col gap-2 md:col-span-7">
            <p className="text-sm text-muted">{CRON_HINT.how}</p>
            <p className="text-sm">
              <span className="text-subtle">Jadwal:</span> {CRON_HINT.schedule}
            </p>
            <code className="mt-1 block overflow-x-auto rounded-xl bg-core-muted px-3 py-2 font-mono text-xs ring-1 ring-hairline" translate="no">
              curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; {origin}/api/cron/tick
            </code>
          </div>
          <div className="flex flex-col gap-3 md:col-span-5">
            <p className="text-sm">
              <span className="text-subtle">Terakhir berjalan:</span> {tick ? `${fmtDate(tick)}, ${TIME.format(tick)} WIB` : "belum pernah"}
            </p>
            <RunTickButton />
          </div>
        </Panel>
      </Section>
    </div>
  );
}
