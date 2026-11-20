import { connection } from "next/server";
import { Suspense } from "react";
import { OUTPUT_ROLES, listAgentOutputs, parseOutputRoles, summarizeOutputs } from "@/lib/studio/service";
import { OutputBoard, OutputFilterBar, OutputSummary, OutputTimeline, type OutputFilters } from "../_components/outputs";
import { PageHeader, Section } from "../_components/ui";

export const metadata = { title: "Hasil kerja · Ryuartistry Studio" };

export default function OutputsPage({ searchParams }: PageProps<"/dashboard/outputs">) {
  return (
    <>
      <PageHeader
        eyebrow="Agen · Output"
        title="Hasil kerja"
        description="Semua yang dikirim tiap agen: pindaian, riset, ide, review, aset, dan metadata. Pilih satu agen untuk fokus, atau beberapa sekaligus untuk dibandingkan berdampingan."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat hasil kerja…</p>}>
        <OutputsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OutputsData({ searchParams }: { searchParams: PageProps<"/dashboard/outputs">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const all = !sp.agents;
  const roles = parseOutputRoles(sp.agents);
  const days = [1, 7, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const platform = sp.platform === "adobe_stock" || sp.platform === "facebook_reels" ? sp.platform : "all";
  const view = sp.view === "timeline" ? "timeline" : "board";
  const f: OutputFilters = { roles, all, platform, days, view };

  const items = await listAgentOutputs({ roles, days, platform: platform === "all" ? undefined : platform });

  return (
    <div className="flex flex-col gap-12">
      <OutputFilterBar f={f} roles={OUTPUT_ROLES} />
      <OutputSummary rows={summarizeOutputs(items, roles)} />
      <Section eyebrow={`${items.length} hasil · ${days === 1 ? "24 jam terakhir" : `${days} hari terakhir`}`} title={view === "board" ? "Per agen" : "Linimasa"}>
        {view === "board" ? <OutputBoard items={items} roles={roles} /> : <OutputTimeline items={items} />}
      </Section>
    </div>
  );
}
