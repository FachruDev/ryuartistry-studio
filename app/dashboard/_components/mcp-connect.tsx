import type { listConnections } from "@/lib/oauth/service";
import { revokeConnectionAction } from "../automation/actions";
import { CopyText } from "./reels-forms";
import { Badge, Panel, Section, fmtDate } from "./ui";

type Connection = Awaited<ReturnType<typeof listConnections>>[number];

const OAUTH_APPS = [
  { app: "Claude.ai / Claude Desktop", steps: "Settings → Connectors → Add custom connector. Tempel URL MCP, biarkan Advanced settings kosong (pendaftaran otomatis)." },
  { app: "ChatGPT", steps: "Plugins / Developer mode → Add custom MCP server. Tempel URL MCP, pilih autentikasi OAuth." },
  { app: "Gemini app", steps: "Settings → Connected apps → Custom apps (saat ini terbatas akun pribadi di AS). Tempel URL MCP." },
  { app: "Grok (grok.com)", steps: "grok.com/connectors → New Connector → Custom. Tempel URL MCP lalu selesaikan sign-in." },
];

const HEADER_APPS = "Claude Code, Gemini CLI, dan API xAI (Remote MCP) bisa memakai header Authorization: Bearer <token agen> dari kit koneksi tiap agen.";

/** How each AI app connects: OAuth (sign in + pick agent) or a static header token. */
export function ConnectGuide({ mcpUrl, delay }: { mcpUrl: string; delay?: number }) {
  return (
    <Section eyebrow="Koneksi aman" title="Menghubungkan aplikasi AI" delay={delay}>
      <Panel coreClassName="grid gap-6 p-6 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-5">
          <p className="text-sm text-muted">
            Aplikasi AI terhubung lewat <strong className="text-text">OAuth 2.1</strong>: kamu login ke studio, lalu memilih agen yang diwakili aplikasi
            itu. Token berlaku 1 jam, diperbarui otomatis, terikat ke URL ini, dan bisa dicabut di bawah.
          </p>
          <div>
            <p className="mb-1.5 text-xs text-subtle">URL server MCP</p>
            <CopyText text={mcpUrl} label="URL server MCP" copyLabel="Salin URL" rows={1} />
          </div>
          <p className="text-xs text-subtle">{HEADER_APPS}</p>
        </div>
        <ol className="flex flex-col gap-3 md:col-span-7">
          {OAUTH_APPS.map((a, i) => (
            <li key={a.app} className="flex gap-3 rounded-2xl bg-core-muted p-4 text-sm ring-1 ring-hairline">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-core font-mono text-xs ring-1 ring-hairline">{i + 1}</span>
              <span>
                <span className="block font-medium">{a.app}</span>
                <span className="text-muted">{a.steps}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </Section>
  );
}

/** OAuth connections of one agent, each revocable. */
export function AgentConnections({ connections }: { connections: Connection[] }) {
  if (!connections.length) return <p className="text-xs text-subtle">Belum ada aplikasi yang terhubung lewat OAuth.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {connections.map((c) => (
        <li key={c.familyId} className="flex items-center gap-3 rounded-2xl bg-core-muted px-3 py-2 text-xs ring-1 ring-hairline">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{c.clientName}</p>
            <p className="text-subtle">
              sejak {fmtDate(c.createdAt)} · {c.lastUsedAt ? `dipakai ${fmtDate(c.lastUsedAt)}` : "belum dipakai"}
            </p>
          </div>
          <Badge tone="success">OAuth</Badge>
          <form action={revokeConnectionAction}>
            <input type="hidden" name="familyId" value={c.familyId} />
            <button
              type="submit"
              aria-label={`Cabut koneksi ${c.clientName}`}
              className="rounded-full px-2.5 py-1 text-xs text-muted ring-1 ring-hairline transition-colors hover:bg-shell hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Cabut
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
