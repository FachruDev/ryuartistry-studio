import { connection } from "next/server";
import { Suspense } from "react";
import { addDays } from "@/lib/studio/research-periods";
import { performanceOverview } from "@/lib/studio/service";
import { BarChart } from "../_components/bar-chart";
import { PerformanceImport } from "../_components/performance-import";
import { Badge, Empty, PageHeader, Panel, Section, Stat, table, usd } from "../_components/ui";

export const metadata = { title: "Performa · Ryuartistry Studio" };

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Adobe Stock · 30 hari"
        title="Performa penjualan"
        description="Data penjualan kembali ke Rina dan Shion, supaya ide berikutnya mengikuti apa yang benar-benar laku, bukan hanya yang dinilai bagus."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat performa…</p>}>
        <PerformanceData />
      </Suspense>
    </>
  );
}

async function PerformanceData() {
  await connection();
  const perf = await performanceOverview("adobe_stock", 30);

  // Fill every day of the window so gaps show as empty columns, not missing ones.
  const byDay = new Map(perf.perDay.map((d) => [d.day, d]));
  const days = Array.from({ length: 30 }, (_, i) => addDays(perf.period.start, i));
  const revenue = days.map((day) => ({ day, value: byDay.get(day)?.revenue ?? 0 }));
  const downloads = days.map((day) => ({ day, value: byDay.get(day)?.downloads ?? 0 }));

  return (
    <div className="flex flex-col gap-16">
      <div className="rise grid gap-4 md:grid-cols-12" style={{ animationDelay: "80ms" }}>
        <div className="md:col-span-4">
          <Stat label="Pendapatan" value={usd(perf.totals.revenueUsd)} hint={`${perf.period.start} – ${perf.period.end}`} />
        </div>
        <div className="md:col-span-4">
          <Stat label="Unduhan" value={perf.totals.downloads.toLocaleString("id-ID")} hint="lisensi terjual" />
        </div>
        <div className="md:col-span-4">
          <Stat label="Aset menghasilkan" value={perf.top.length} hint="minimal satu penjualan" />
        </div>
      </div>

      <Section eyebrow="Per hari" title="Tren 30 hari" delay={140}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel coreClassName="p-6">
            <BarChart title="Pendapatan (USD)" data={revenue} unit="usd" />
          </Panel>
          <Panel coreClassName="p-6">
            <BarChart title="Unduhan" data={downloads} unit="count" />
          </Panel>
        </div>
      </Section>

      <div className="grid gap-16 lg:grid-cols-2 lg:gap-6">
        <Section eyebrow="Terlaris" title="Aset teratas" delay={200}>
          {perf.top.length === 0 ? (
            <Empty>Belum ada penjualan tercatat. Impor CSV penjualan di bawah.</Empty>
          ) : (
            <Panel coreClassName="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Aset</th>
                    <th className={`${table.th} text-right`}>Unduhan</th>
                    <th className={`${table.th} text-right`}>Pendapatan</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.top.map((t) => (
                    <tr key={t.fileName ?? t.title} className={table.row}>
                      <td className={table.td}>
                        {t.title}
                        <span className="mt-0.5 block font-mono text-xs text-subtle">{t.fileName}</span>
                      </td>
                      <td className={`${table.td} text-right font-mono tabular-nums`}>{t.downloads}</td>
                      <td className={`${table.td} text-right font-mono tabular-nums`}>{usd(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>

        <Section eyebrow="Untuk Rina" title="Keyword yang laku dan ditolak" delay={240}>
          {perf.keywords.length === 0 ? (
            <Empty>Belum ada data keyword.</Empty>
          ) : (
            <Panel coreClassName="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Keyword</th>
                    <th className={`${table.th} text-right`}>Terbit</th>
                    <th className={`${table.th} text-right`}>Ditolak</th>
                    <th className={`${table.th} text-right`}>Pendapatan</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.keywords.slice(0, 12).map((k) => (
                    <tr key={k.keyword} className={table.row}>
                      <td className={table.td}>{k.keyword}</td>
                      <td className={`${table.td} text-right font-mono tabular-nums`}>{k.published}</td>
                      <td className={`${table.td} text-right`}>
                        {k.refused ? <Badge tone="danger">{k.refused}</Badge> : <span className="font-mono text-subtle">0</span>}
                      </td>
                      <td className={`${table.td} text-right font-mono tabular-nums`}>{usd(k.revenueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>
      </div>

      <Section eyebrow="Data masuk" title="Impor performa" delay={280}>
        <Panel coreClassName="p-6 sm:p-8">
          <PerformanceImport />
        </Panel>
      </Section>
    </div>
  );
}
