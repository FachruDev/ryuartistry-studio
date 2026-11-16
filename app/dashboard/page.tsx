import { connection } from "next/server";
import { Suspense } from "react";
import { adobeUploadKit, calibrationStats, dashboardSnapshot, submittedAwaitingResult } from "@/lib/studio/service";
import { AdobeKit, AdobeResults } from "./_components/adobe-kit";
import { ApprovalQueue } from "./_components/approval-queue";
import { Calibration } from "./_components/calibration";
import { HaltedCycles, PipelineTable, RecentActivity } from "./_components/pipeline";

export const metadata = { title: "Studio Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ryuartistry Studio</h1>
        <p className="text-sm text-zinc-500">Status pipeline Rina → Shion → Lukas → Linda → Kechlyn</p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat data…</p>}>
        <DashboardData />
      </Suspense>
    </main>
  );
}

async function DashboardData() {
  await connection();
  const [snapshot, kit, submitted, stats] = await Promise.all([
    dashboardSnapshot(),
    adobeUploadKit(),
    submittedAwaitingResult("adobe_stock"),
    calibrationStats("adobe_stock"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <HaltedCycles halted={snapshot.halted} />
      <ApprovalQueue pending={snapshot.pending} />
      <AdobeKit kit={kit} />
      <AdobeResults submitted={submitted} />
      <Calibration stats={stats} />
      <PipelineTable statusCounts={snapshot.statusCounts} />
      <RecentActivity recent={snapshot.recent} />
    </div>
  );
}
