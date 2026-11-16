import { connection } from "next/server";
import { Suspense } from "react";
import { studioToday } from "@/lib/studio/research-periods";
import { getResearchSchedule, getRollupData, listResearch } from "@/lib/studio/service";
import { LatestDaily, ReportHistory, ScheduleToday, WeekTopics } from "../_components/research";
import { PageHeader } from "../_components/ui";

export const metadata = { title: "Riset · Ryuartistry Studio" };

export default function ResearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Rina · Riset pasar"
        title="Riset pasar"
        description="Tiga sesi sehari digabung menjadi laporan harian, lalu dirangkum mingguan, bulanan, dan tahunan dari data terstruktur, bukan ringkasan dari ringkasan."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat riset…</p>}>
        <ResearchData />
      </Suspense>
    </>
  );
}

async function ResearchData() {
  await connection();
  const platform = "adobe_stock" as const;
  const [schedule, week, daily, weekly, monthly, yearly] = await Promise.all([
    getResearchSchedule(platform),
    getRollupData("weekly", platform, studioToday()),
    listResearch({ platform, level: "daily", limit: 1 }),
    listResearch({ platform, level: "weekly", limit: 4 }),
    listResearch({ platform, level: "monthly", limit: 3 }),
    listResearch({ platform, level: "yearly", limit: 1 }),
  ]);
  const history = [...weekly, ...monthly, ...yearly].sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  return (
    <div className="flex flex-col gap-16">
      <ScheduleToday schedule={schedule} delay={80} />
      <LatestDaily report={daily[0]} delay={140} />
      <WeekTopics rollup={week} delay={200} />
      <ReportHistory reports={history} delay={260} />
    </div>
  );
}
