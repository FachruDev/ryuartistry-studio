import type { listTrendScans } from "@/lib/studio/service";
import { Badge, Empty, Panel, Section } from "./ui";

type Scans = Awaited<ReturnType<typeof listTrendScans>>;

const SLOT_LABEL: Record<number, string> = { 1: "pagi", 2: "siang", 3: "malam" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Today's raw trend signals from Rina-Scout. Input for Rina, not research results. */
export function TodayScans({ scans, delay }: { scans: Scans; delay?: number }) {
  const total = scans.reduce((n, s) => n + s.signals.length, 0);
  return (
    <Section
      eyebrow="Rina-Scout · Grok"
      title="Pindaian tren hari ini"
      aside={<Badge tone={scans.length ? "accent" : "neutral"}>{scans.length ? `${total} sinyal` : "belum ada"}</Badge>}
      delay={delay}
    >
      {scans.length === 0 ? (
        <Empty>Belum ada pindaian hari ini. Rina tetap meriset sendiri di malam hari bila pindaian tidak masuk.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="max-w-[68ch] text-sm text-muted">
            Sinyal mentah, belum diverifikasi. Rina memeriksa permintaan dan persaingannya sebelum masuk laporan; topik yang lolos dan
            juga terlihat di sini mendapat bonus keyakinan.
          </p>
          {scans.map((scan) => (
            <Panel key={scan.id} coreClassName="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Slot {scan.slot} · {SLOT_LABEL[scan.slot] ?? ""}
                </p>
                <div className="flex items-center gap-2">
                  <Badge>{scan.model}</Badge>
                  <Badge tone="accent">{scan.signals.length} sinyal</Badge>
                </div>
              </div>
              {scan.notes && <p className="text-sm text-muted">{scan.notes}</p>}
              <ul className="grid gap-3 md:grid-cols-2">
                {[...scan.signals]
                  .sort((a, b) => b.momentum - a.momentum)
                  .map((sig, i) => (
                    <li key={i} className="flex flex-col gap-1.5 rounded-2xl bg-core-muted p-4 ring-1 ring-hairline">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium leading-snug">{sig.topic}</p>
                        <span
                          className="shrink-0 font-mono text-xs tabular-nums text-muted"
                          aria-label={`Momentum ${sig.momentum} dari 10`}
                          title="Momentum 1-10"
                        >
                          ↑{sig.momentum}
                        </span>
                      </div>
                      <p className="text-sm text-muted">{sig.why}</p>
                      <p className="text-xs text-subtle">{sig.keywords.slice(0, 6).join(" · ")}</p>
                      {sig.sources.length > 0 && (
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {sig.sources.slice(0, 3).map((src) => (
                            <a
                              key={src.url}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent underline-offset-2 hover:underline"
                            >
                              {hostOf(src.url)}
                            </a>
                          ))}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
