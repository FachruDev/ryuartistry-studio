import { connection } from "next/server";
import { Suspense } from "react";
import { dashboardSnapshot, navCounts, performanceOverview } from "@/lib/studio/service";
import { ApprovalQueue } from "./_components/approval-queue";
import { KpiBento } from "./_components/kpis";
import { HaltedCycles, PipelineTable, RecentActivity } from "./_components/pipeline";
import { PageHeader } from "./_components/ui";

export const metadata = { title: "Ringkasan · Ryuartistry Studio" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Studio · Ringkasan"
        title="Selamat datang kembali"
        description="Rina-Scout memindai tren, Rina meriset mendalam, Shion menulis ide, Lukas menyaring, Linda mengeksekusi, Kechlyn memutuskan. Keputusan akhir ada di kamu."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat data…</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  await connection();
  const [snapshot, counts, adobe, reels] = await Promise.all([
    dashboardSnapshot(),
    navCounts(),
    performanceOverview("adobe_stock", 30),
    performanceOverview("facebook_reels", 30),
  ]);

  return (
    <div className="flex flex-col gap-16">
      <KpiBento snapshot={snapshot} counts={counts} adobe={adobe} reels={reels} />
      <div id="halted" className="scroll-mt-28">
        <HaltedCycles halted={snapshot.halted} />
      </div>
      <ApprovalQueue pending={snapshot.pending} delay={120} />
      <PipelineTable statusCounts={snapshot.statusCounts} delay={180} />
      <RecentActivity recent={snapshot.recent} delay={240} />
    </div>
  );
}
