import { ADOBE_CATEGORIES } from "@/lib/studio/config";
import type { dashboardSnapshot } from "@/lib/studio/service";
import { decidePublicationAction } from "../actions";
import { Empty, Section, card, input, primaryBtn, secondaryBtn } from "./ui";

type Pending = Awaited<ReturnType<typeof dashboardSnapshot>>["pending"];

export function ApprovalQueue({ pending }: { pending: Pending }) {
  return (
    <Section title={`Menunggu approval (${pending.length})`}>
      {pending.length === 0 ? (
        <Empty>Tidak ada yang menunggu.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map(({ pub, asset, url }) => (
            <article key={pub.id} className={card}>
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
                  {pub.agentScore != null && ` · skor Kechlyn ${pub.agentScore}`}
                </p>
                {pub.fileName && <p className="font-mono text-xs text-zinc-500">{pub.fileName}</p>}
              </div>
              {pub.category && (
                <p className="text-xs text-zinc-500">
                  Kategori {pub.category}: {ADOBE_CATEGORIES[Number(pub.category)] ?? "?"}
                </p>
              )}
              {pub.caption && <p className="whitespace-pre-wrap text-sm">{pub.caption}</p>}
              {pub.keywords.length > 0 && (
                <p className="text-xs text-zinc-500">
                  <span className="font-medium">Keyword ({pub.keywords.length}):</span> {pub.keywords.join(", ")}
                </p>
              )}
              {pub.hashtags.length > 0 && <p className="text-xs text-zinc-500">{pub.hashtags.join(" ")}</p>}
              <form action={decidePublicationAction} className="flex flex-col gap-2">
                <input type="hidden" name="publicationId" value={pub.id} />
                <label className="flex items-center gap-2 text-sm">
                  Skor kamu (1-10)
                  <input
                    type="number"
                    name="humanScore"
                    min={1}
                    max={10}
                    required
                    className={`${input} w-20`}
                    aria-describedby={`score-help-${pub.id}`}
                  />
                </label>
                <p id={`score-help-${pub.id}`} className="text-xs text-zinc-500">
                  Dipakai untuk mengkalibrasi rubrik Kechlyn.
                </p>
                <textarea name="note" placeholder="Catatan (wajib jika ditolak)" className={input} rows={2} />
                <div className="flex gap-2">
                  <button name="decision" value="approve" className={primaryBtn}>
                    Setujui
                  </button>
                  <button name="decision" value="reject" className={secondaryBtn}>
                    Tolak → Linda
                  </button>
                </div>
              </form>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
