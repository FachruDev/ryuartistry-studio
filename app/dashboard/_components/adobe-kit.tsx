import type { adobeUploadKit, submittedAwaitingResult } from "@/lib/studio/service";
import { markSubmittedAction, recordPlatformResultAction } from "../actions";
import { Empty, Section, input, primaryBtn, row, secondaryBtn, tableWrap, thead } from "./ui";

type Kit = Awaited<ReturnType<typeof adobeUploadKit>>;
type Submitted = Awaited<ReturnType<typeof submittedAwaitingResult>>;

export function AdobeKit({ kit }: { kit: Kit }) {
  return (
    <Section title={`Kit upload Adobe Stock (${kit.length})`}>
      {kit.length === 0 ? (
        <Empty>Belum ada gambar yang disetujui untuk diupload.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="list-decimal pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Unduh semua file di bawah (nama file sudah sesuai CSV).</li>
            <li>Upload file ke portal contributor Adobe Stock.</li>
            <li>
              Unduh CSV, lalu di portal: Uploaded Files → New → Upload CSV. Centang{" "}
              <em>Created using generative AI tools</em> sebelum submit.
            </li>
            <li>Kembali ke sini, tandai item sebagai sudah diupload.</li>
          </ol>
          <a href="/dashboard/kit/adobe-csv" className={`${secondaryBtn} self-start`} download>
            Unduh CSV metadata
          </a>
          <form action={markSubmittedAction} className="flex flex-col gap-3">
            <div className={tableWrap}>
              <table className="w-full text-sm">
                <thead className={thead}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Diupload?</th>
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Judul</th>
                    <th className="px-3 py-2 font-medium">Kategori</th>
                    <th className="px-3 py-2 text-right font-medium">Keyword</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.map(({ pub, downloadUrl, categoryName, width, height }) => (
                    <tr key={pub.id} className={row}>
                      <td className="px-3 py-2">
                        <input type="checkbox" name="publicationId" value={pub.id} aria-label={`Tandai ${pub.fileName}`} />
                      </td>
                      <td className="px-3 py-2">
                        <a href={downloadUrl} className="font-mono text-xs underline">
                          {pub.fileName}
                        </a>
                        <span className="block text-xs text-zinc-500">
                          {width}×{height}
                        </span>
                      </td>
                      <td className="px-3 py-2">{pub.title}</td>
                      <td className="px-3 py-2 text-xs">{categoryName ?? pub.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pub.keywords.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className={`${primaryBtn} self-start`}>Tandai yang dicentang sudah diupload</button>
          </form>
        </div>
      )}
    </Section>
  );
}

export function AdobeResults({ submitted }: { submitted: Submitted }) {
  return (
    <Section title={`Menunggu hasil review Adobe (${submitted.length})`}>
      {submitted.length === 0 ? (
        <Empty>Tidak ada.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {submitted.map((p) => (
            <li key={p.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-sm font-medium">{p.title}</p>
              <p className="font-mono text-xs text-zinc-500">{p.fileName}</p>
              <form action={recordPlatformResultAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="publicationId" value={p.id} />
                <input name="externalId" placeholder="ID Adobe (opsional)" className={`${input} w-40`} />
                <input name="note" placeholder="Alasan jika ditolak" className={`${input} min-w-48 flex-1`} />
                <button name="result" value="accepted" className={primaryBtn}>
                  Diterima
                </button>
                <button name="result" value="rejected" className={secondaryBtn}>
                  Ditolak
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
