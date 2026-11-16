import { connection } from "next/server";
import { Suspense } from "react";
import { budgetOverview, calibrationStats, getAutomationSettings, listNotifications } from "@/lib/studio/service";
import { SettingsForm } from "../_components/automation-forms";
import { Badge, Empty, PLATFORM_LABEL, PageHeader, Panel, Section, fmtDate, usd, type Tone } from "../_components/ui";
import { markAllReadAction } from "./actions";

export const metadata = { title: "Pengaturan Otomasi · Ryuartistry Studio" };

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  info: { label: "info", tone: "accent" },
  warn: { label: "peringatan", tone: "warn" },
  critical: { label: "kritis", tone: "danger" },
};

export default function AutomationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Otomasi · Pengaturan"
        title="Pengaturan otomasi"
        description="Atur kapan studio boleh berjalan tanpa kamu: anggaran yang menghentikan agen, publikasi otomatis setelah kalibrasi tercapai, dan ke mana peringatan dikirim."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat pengaturan…</p>}>
        <AutomationData />
      </Suspense>
    </>
  );
}

async function AutomationData() {
  await connection();
  const [settings, budgets, adobe, reels, notes] = await Promise.all([
    getAutomationSettings(),
    budgetOverview(),
    calibrationStats("adobe_stock"),
    calibrationStats("facebook_reels"),
    listNotifications(50),
  ]);
  const ready = { adobe_stock: adobe.readyForAutoMode, facebook_reels: reels.readyForAutoMode };

  return (
    <div className="flex flex-col gap-16">
      <Section eyebrow="Hari ini (WIB)" title="Pemakaian anggaran" delay={80}>
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const ratio = b.limitUsd ? Math.min(1, b.spentUsd / b.limitUsd) : 0;
            return (
              <Panel key={b.platform} coreClassName="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted">{PLATFORM_LABEL[b.platform]}</p>
                  <Badge tone={b.blocked ? "danger" : b.limitUsd ? "neutral" : "accent"}>
                    {b.blocked ? "habis, agen berhenti" : b.limitUsd ? `sisa ${usd(b.remainingUsd ?? 0)}` : "tanpa batas"}
                  </Badge>
                </div>
                <p className="text-3xl font-semibold tracking-tight">
                  {usd(b.spentUsd)}
                  <span className="ml-2 text-base font-normal text-muted">/ {b.limitUsd != null ? usd(b.limitUsd) : "∞"}</span>
                </p>
                <div className={`h-1.5 overflow-hidden rounded-full ${b.blocked ? "bg-danger-soft" : "bg-accent-soft"}`} aria-hidden="true">
                  <div
                    className={`h-full origin-left rounded-full ${b.blocked ? "bg-danger" : "bg-accent"}`}
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Aturan" title="Pengaturan" delay={140}>
        <Panel coreClassName="p-6 sm:p-8">
          <SettingsForm settings={settings} ready={ready} />
        </Panel>
      </Section>

      <div id="notifikasi" className="scroll-mt-28">
        <Section
          eyebrow="Riwayat"
          title="Notifikasi"
          aside={
            notes.some((n) => !n.readAt) && (
              <form action={markAllReadAction}>
                <button type="submit" className="rounded-full px-3 py-1.5 text-sm text-muted ring-1 ring-hairline transition-colors hover:bg-shell hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  Tandai Semua Dibaca
                </button>
              </form>
            )
          }
          delay={200}
        >
          {notes.length === 0 ? (
            <Empty>Belum ada notifikasi. Jalankan cron atau tombol pengecekan di halaman Agen.</Empty>
          ) : (
            <Panel coreClassName="divide-y divide-[var(--hairline)]">
              {notes.map((n) => (
                <div key={n.id} className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 ${n.readAt ? "opacity-70" : ""}`}>
                  <div className="w-28 shrink-0">
                    <Badge tone={SEVERITY[n.severity].tone}>{SEVERITY[n.severity].label}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={n.readAt ? "" : "font-medium"}>{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">
                    {fmtDate(n.createdAt)}
                    {n.href && (
                      <a href={n.href} className="text-accent underline-offset-4 hover:underline">
                        Buka
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
          )}
        </Section>
      </div>
    </div>
  );
}
