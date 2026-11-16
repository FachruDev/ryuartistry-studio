import { connection } from "next/server";
import { Suspense } from "react";
import {
  adobeUploadKit,
  calibrationStats,
  dashboardSnapshot,
  performanceOverview,
  submittedAwaitingResult,
} from "@/lib/studio/service";
import { AdobeKit, AdobeResults } from "./_components/adobe-kit";
import { ApprovalQueue } from "./_components/approval-queue";
import { Calibration } from "./_components/calibration";
import { KpiBento } from "./_components/kpis";
import { HaltedCycles, PipelineTable, RecentActivity } from "./_components/pipeline";
import { PageHeader } from "./_components/ui";

export const metadata = { title: "Ringkasan · Ryuartistry Studio" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Studio · Ringkasan"
        title="Ryuartistry Studio"
        description="Rina meriset, Shion menulis ide, Lukas menyaring, Linda mengeksekusi, Kechlyn memutuskan. Keputusan akhir ada di kamu."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat data…</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  await connection();
  const [snapshot, kit, submitted, stats, perf] = await Promise.all([
    dashboardSnapshot(),
    adobeUploadKit(),
    submittedAwaitingResult("adobe_stock"),
    calibrationStats("adobe_stock"),
    performanceOverview("adobe_stock", 30),
  ]);

  return (
    <div className="flex flex-col gap-16">
      <KpiBento snapshot={snapshot} perf={perf} kitCount={kit.length} awaitingAdobe={submitted.length} />
      <HaltedCycles halted={snapshot.halted} />
      <ApprovalQueue pending={snapshot.pending} delay={120} />
      <AdobeKit kit={kit} delay={160} />
      <AdobeResults submitted={submitted} delay={200} />
      <Calibration stats={stats} delay={240} />
      <PipelineTable statusCounts={snapshot.statusCounts} delay={280} />
      <RecentActivity recent={snapshot.recent} delay={320} />
    </div>
  );
}
