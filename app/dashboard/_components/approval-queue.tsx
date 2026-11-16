import { ADOBE_CATEGORIES } from "@/lib/studio/config";
import type { dashboardSnapshot } from "@/lib/studio/service";
import { decidePublicationAction } from "../actions";
import { IconCheck, IconX } from "./icons";
import { Badge, ButtonIcon, Empty, Panel, Section, btn, input } from "./ui";

type Pending = Awaited<ReturnType<typeof dashboardSnapshot>>["pending"];

export function ApprovalQueue({ pending, delay }: { pending: Pending; delay?: number }) {
  return (
    <Section
      eyebrow="Keputusanmu"
      title="Menunggu approval"
      aside={<Badge tone={pending.length ? "accent" : "neutral"}>{pending.length} item</Badge>}
      delay={delay}
    >
      {pending.length === 0 ? (
        <Empty>Tidak ada yang menunggu. Kechlyn akan mengirim aset yang lolos ke sini.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {pending.map(({ pub, asset, url }) => (
            <Panel key={pub.id} coreClassName="flex flex-col overflow-hidden">
              <div className="bg-core-muted p-3">
                {asset.contentType.startsWith("video/") ? (
                  <video src={url} controls className="max-h-80 w-full rounded-2xl bg-black object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned URL from private storage
                  <img src={url} alt={pub.title} className="max-h-80 w-full rounded-2xl object-contain" />
                )}
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{pub.platform === "adobe_stock" ? "Adobe Stock" : "FB Reels"}</Badge>
                    {pub.agentScore != null && <Badge tone="accent">Kechlyn {pub.agentScore}</Badge>}
                    {pub.category && <Badge>{ADOBE_CATEGORIES[Number(pub.category)] ?? `Kategori ${pub.category}`}</Badge>}
                  </div>
                  <h3 className="mt-3 text-lg font-medium tracking-tight">{pub.title}</h3>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {pub.fileName ?? ""} · {asset.width}×{asset.height}
                    {asset.durationSec ? ` · ${asset.durationSec}s` : ""}
                  </p>
                </div>
                {pub.caption && <p className="whitespace-pre-wrap text-sm text-muted">{pub.caption}</p>}
                {pub.keywords.length > 0 && (
                  <p className="text-xs leading-relaxed text-muted">
                    <span className="text-subtle">{pub.keywords.length} keyword · </span>
                    {pub.keywords.join(", ")}
                  </p>
                )}
                <form action={decidePublicationAction} className="flex flex-col gap-3 border-t border-hairline pt-4">
                  <input type="hidden" name="publicationId" value={pub.id} />
                  <div className="flex items-center gap-3">
                    <label htmlFor={`score-${pub.id}`} className="text-sm text-muted">
                      Skor kamu
                    </label>
                    <input
                      id={`score-${pub.id}`}
                      type="number"
                      name="humanScore"
                      min={1}
                      max={10}
                      required
                      placeholder="1-10"
                      className={`${input} w-24 font-mono`}
                    />
                    <span className="text-xs text-subtle">untuk kalibrasi Kechlyn</span>
                  </div>
                  <textarea name="note" placeholder="Catatan (wajib jika ditolak)" className={input} rows={2} />
                  <div className="flex flex-wrap gap-2">
                    <button name="decision" value="approve" className={btn.primary}>
                      Setujui
                      <ButtonIcon inverted>
                        <IconCheck />
                      </ButtonIcon>
                    </button>
                    <button name="decision" value="reject" className={btn.ghost}>
                      Tolak ke Linda
                      <ButtonIcon>
                        <IconX />
                      </ButtonIcon>
                    </button>
                  </div>
                </form>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
