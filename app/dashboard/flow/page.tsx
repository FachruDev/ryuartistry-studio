import { connection } from "next/server";
import { Suspense } from "react";
import { studioToday } from "@/lib/studio/research-periods";
import { getDayFlow, getMonthFlow, parseMonth, shiftMonth } from "@/lib/studio/service";
import { DayFlowView, MonthFlowView } from "../_components/flow";
import { PageHeader, PlatformTabs, fmtDay, parsePlatform } from "../_components/ui";

export const metadata = { title: "Alur harian · Ryuartistry Studio" };

export default function FlowPage({ searchParams }: PageProps<"/dashboard/flow">) {
  return (
    <>
      <PageHeader
        eyebrow="Studio · Alur"
        title="Alur harian"
        description="Setiap hari berjalan dari pindaian tren sampai terbit. Lihat tahap mana yang sudah selesai hari ini, lalu cek sepanjang bulan hari mana yang tuntas sampai publikasi."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat alur…</p>}>
        <FlowData searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FlowData({ searchParams }: { searchParams: PageProps<"/dashboard/flow">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const platform = parsePlatform(sp.platform);
  const today = studioToday();
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const month = typeof sp.month === "string" ? parseMonth(sp.month) : day.slice(0, 7);
  const [flow, monthData] = await Promise.all([getDayFlow(platform, day), getMonthFlow(platform, month)]);

  const href = (q: Record<string, string>) => `/dashboard/flow?${new URLSearchParams({ platform, ...q })}`;
  const next = shiftMonth(month, 1);
  return (
    <div className="flex flex-col gap-16">
      <div className="-mt-6">
        <PlatformTabs base="/dashboard/flow" current={platform} />
      </div>
      <DayFlowView flow={flow} title={day === today ? "Hari ini" : fmtDay(day)} delay={80} />
      <MonthFlowView
        data={monthData}
        selected={day}
        dayHref={(d) => href({ day: d, month })}
        nav={{ prev: href({ month: shiftMonth(month, -1), day }), next: next <= today.slice(0, 7) ? href({ month: next, day }) : null }}
        delay={160}
      />
    </div>
  );
}
