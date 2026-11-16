import type { postedReels, reelsPostingKit } from "@/lib/studio/service";
import { IconDownload } from "./icons";
import { CopyText, MarkPostedForm, RestrictionForm } from "./reels-forms";
import { Badge, ButtonIcon, Empty, Panel, Section, btn, fmtDate } from "./ui";

type Kit = Awaited<ReturnType<typeof reelsPostingKit>>;
type Posted = Awaited<ReturnType<typeof postedReels>>;

const STEPS = [
  "Unduh video, lalu buka Meta Business Suite atau aplikasi Facebook.",
  "Buat Reel, tempel caption & hashtag dari kotak di samping.",
  "Aktifkan label konten AI (AI info) sebelum membagikan.",
  "Salin link reel yang sudah terbit, tempel di sini.",
];

export function ReelsKit({ kit, niche, delay }: { kit: Kit; niche: string | null; delay?: number }) {
  return (
    <Section
      eyebrow="Facebook Reels"
      title="Kit posting"
      aside={<Badge tone={kit.length ? "accent" : "neutral"}>{kit.length} siap diposting</Badge>}
      delay={delay}
    >
      {!niche && (
        <p className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn" role="note">
          Niche kanal belum ditetapkan. Isi <code className="font-mono">STUDIO_REELS_NICHE</code> di <code className="font-mono">.env.local</code>, supaya
          Rina dan Shion tidak membuat konten acak (Meta menurunkan monetisasi konten yang tidak orisinal).
        </p>
      )}
      {kit.length === 0 ? (
        <Empty>Belum ada reel yang disetujui untuk diposting.</Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 rounded-2xl bg-shell p-4 text-sm text-muted ring-1 ring-hairline">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-core font-mono text-xs text-text ring-1 ring-hairline">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {kit.map((r) => (
            <Panel key={r.pub.id} coreClassName="grid gap-6 p-5 md:grid-cols-12">
              <div className="md:col-span-4">
                <video
                  src={r.downloadUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="aspect-[9/16] w-full max-w-[280px] rounded-2xl bg-black object-contain"
                  aria-label={`Pratinjau ${r.pub.title}`}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-4 md:col-span-8">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.durationSec != null && <Badge>{Math.round(r.durationSec)} detik</Badge>}
                    {r.pub.agentScore != null && <Badge tone="accent">Kechlyn {r.pub.agentScore}</Badge>}
                    {r.pub.humanScore != null && <Badge>Skormu {r.pub.humanScore}</Badge>}
                  </div>
                  <h3 className="mt-3 text-balance text-lg font-medium tracking-tight">{r.pub.title}</h3>
                  <p className="mt-1 truncate font-mono text-xs text-subtle">{r.pub.fileName}</p>
                </div>
                <CopyText text={r.postText} label={`Caption untuk ${r.pub.title}`} />
                <a href={r.downloadUrl} download className={`${btn.ghost} self-start`}>
                  Unduh Video
                  <ButtonIcon>
                    <IconDownload />
                  </ButtonIcon>
                </a>
                <div className="border-t border-hairline pt-4">
                  <MarkPostedForm publicationId={r.pub.id} />
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}

export function PostedReels({ posted, delay }: { posted: Posted; delay?: number }) {
  return (
    <Section eyebrow="Terbit" title="Reel yang sudah diposting" aside={<Badge>{posted.length}</Badge>} delay={delay}>
      {posted.length === 0 ? (
        <Empty>Belum ada reel yang terposting.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {posted.map((p) => (
            <Panel key={p.id} coreClassName="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
              <div className="min-w-0 lg:w-80">
                <p className="truncate font-medium">{p.title}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  Terbit {p.publishedAt ? fmtDate(p.publishedAt) : "–"} ·{" "}
                  {p.externalId && (
                    <a href={p.externalId} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
                      Buka di Facebook
                    </a>
                  )}
                </p>
              </div>
              <div className="flex-1">
                <RestrictionForm publicationId={p.id} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
