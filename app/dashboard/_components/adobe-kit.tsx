import type { adobeUploadKit, submittedAwaitingResult } from "@/lib/studio/service";
import { markSubmittedAction, recordPlatformResultAction } from "../actions";
import { IconCheck, IconDownload, IconUpload, IconX } from "./icons";
import { Badge, ButtonIcon, Empty, Panel, Section, btn, input, table } from "./ui";

type Kit = Awaited<ReturnType<typeof adobeUploadKit>>;
type Submitted = Awaited<ReturnType<typeof submittedAwaitingResult>>;

const STEPS = [
  "Unduh file di tabel. Namanya sudah sesuai CSV.",
  "Upload file ke portal contributor Adobe Stock.",
  "Unduh CSV, lalu di portal: Uploaded Files → New → Upload CSV.",
  "Centang Created using generative AI tools, submit, lalu tandai di sini.",
];

export function AdobeKit({ kit, delay }: { kit: Kit; delay?: number }) {
  return (
    <Section
      eyebrow="Adobe Stock"
      title="Kit upload"
      aside={
        kit.length > 0 && (
          <a href="/dashboard/kit/adobe-csv" className={btn.ghost} download>
            Unduh CSV metadata
            <ButtonIcon>
              <IconDownload />
            </ButtonIcon>
          </a>
        )
      }
      delay={delay}
    >
      {kit.length === 0 ? (
        <Empty>Belum ada gambar yang disetujui untuk diupload.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <Panel className="lg:col-span-4" coreClassName="p-6">
            <ol className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-muted">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shell font-mono text-xs text-text ring-1 ring-hairline">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </Panel>
          <form action={markSubmittedAction} className="flex flex-col gap-4 lg:col-span-8">
            <Panel coreClassName="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>
                      <span className="sr-only">Pilih</span>
                    </th>
                    <th className={table.th}>File</th>
                    <th className={table.th}>Judul</th>
                    <th className={`${table.th} text-right`}>Keyword</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.map(({ pub, downloadUrl, categoryName, width, height }) => (
                    <tr key={pub.id} className={table.row}>
                      <td className={table.td}>
                        <input
                          type="checkbox"
                          name="publicationId"
                          value={pub.id}
                          aria-label={`Tandai ${pub.fileName} sudah diupload`}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className={table.td}>
                        <a href={downloadUrl} className="font-mono text-xs text-accent underline-offset-4 hover:underline">
                          {pub.fileName}
                        </a>
                        <span className="mt-0.5 block text-xs text-subtle">
                          {width}×{height}
                        </span>
                      </td>
                      <td className={table.td}>
                        {pub.title}
                        {categoryName && <span className="mt-0.5 block text-xs text-subtle">{categoryName}</span>}
                      </td>
                      <td className={`${table.td} text-right font-mono tabular-nums`}>{pub.keywords.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <button className={`${btn.primary} self-start`}>
              Tandai yang dicentang sudah diupload
              <ButtonIcon inverted>
                <IconUpload />
              </ButtonIcon>
            </button>
          </form>
        </div>
      )}
    </Section>
  );
}

export function AdobeResults({ submitted, delay }: { submitted: Submitted; delay?: number }) {
  return (
    <Section
      eyebrow="Moderasi Adobe"
      title="Menunggu hasil review"
      aside={<Badge tone={submitted.length ? "warn" : "neutral"}>{submitted.length} item</Badge>}
      delay={delay}
    >
      {submitted.length === 0 ? (
        <Empty>Tidak ada yang sedang direview Adobe.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {submitted.map((p) => (
            <Panel key={p.id} coreClassName="p-5">
              <form action={recordPlatformResultAction} className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <input type="hidden" name="publicationId" value={p.id} />
                <div className="min-w-0 lg:w-64">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate font-mono text-xs text-subtle">{p.fileName}</p>
                </div>
                <input name="externalId" placeholder="ID Adobe (opsional)" className={`${input} lg:w-44`} aria-label="ID Adobe" />
                <input name="note" placeholder="Alasan jika ditolak" className={`${input} lg:flex-1`} aria-label="Alasan penolakan" />
                <div className="flex gap-2">
                  <button name="result" value="accepted" className={btn.primary}>
                    Diterima
                    <ButtonIcon inverted>
                      <IconCheck />
                    </ButtonIcon>
                  </button>
                  <button name="result" value="rejected" className={btn.ghost}>
                    Ditolak
                    <ButtonIcon>
                      <IconX />
                    </ButtonIcon>
                  </button>
                </div>
              </form>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
