/** Rina's MCP tools: schedule, sessions, daily merge, rollups, performance. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parsePerformanceCsv } from "@/lib/studio/performance-csv";
import { studioToday } from "@/lib/studio/research-periods";
import * as studio from "@/lib/studio/service";
import { dateSchema, levelSchema, platformSchema, run, type LevelArg, type PlatformArg } from "./helpers";

const opportunitySchema = z
  .object({
    topic: z.string().min(2),
    keywords: z.array(z.string()).min(1),
    rationale: z.string().min(5).describe("Kenapa ini peluang: permintaan, persaingan, sumber"),
    priority: z.number().int().min(1).max(10).describe("10 = kerjakan paling dulu"),
    suggested_style: z.string().optional(),
    seasonality: z.string().optional(),
  })
  .catchall(z.unknown());

export function registerResearchTools(server: McpServer, agent: studio.Agent) {
  server.registerTool(
    "get_research_schedule",
    {
      description:
        "Apa yang harus dikerjakan sekarang (zona waktu Asia/Jakarta): slot riset yang belum diisi, laporan harian yang belum diterbitkan, dan rollup mingguan/bulanan/tahunan yang jatuh tempo. Panggil ini di awal setiap shift.",
      inputSchema: { platform: platformSchema },
    },
    run(async ({ platform }: { platform: PlatformArg }) => studio.getResearchSchedule(platform)),
  );

  server.registerTool(
    "submit_research_session",
    {
      description:
        "Simpan satu sesi riset (slot 1=pagi, 2=siang, 3=malam, waktu Jakarta) beserta temuan terstruktur. Satu sesi per model per slot; Claude dan Grok boleh mengisi slot yang sama. Temuan tanpa sumber ditandai belum terverifikasi.",
      inputSchema: {
        platform: platformSchema,
        day: dateSchema.default(() => studioToday()),
        slot: z.number().int().min(1).max(3),
        model: z.string().describe("Model yang melakukan riset, mis. claude / grok"),
        notes: z.string().optional(),
        findings: z
          .array(
            z.object({
              topic: z.string().min(2),
              keywords: z.array(z.string()).min(1),
              demandScore: z.number().int().min(1).max(10),
              competitionScore: z.number().int().min(1).max(10).describe("Rendah = sedikit pesaing = peluang"),
              seasonality: z.string().describe('"evergreen" atau tanggal/nama event'),
              sources: z.array(z.object({ url: z.string().url(), accessedAt: z.string() })),
              confidence: z.number().int().min(1).max(10),
              notes: z.string().optional(),
            }),
          )
          .min(1),
      },
    },
    run(async (a: Parameters<typeof studio.submitResearchSession>[1]) => studio.submitResearchSession(agent, a)),
  );

  server.registerTool(
    "list_findings",
    {
      description: "Temuan mentah pada satu hari (semua sesi).",
      inputSchema: { platform: platformSchema, day: dateSchema },
    },
    run(async (a: { platform: PlatformArg; day: string }) => studio.listFindings(a)),
  );

  server.registerTool(
    "get_daily_merge_data",
    {
      description:
        "Data untuk laporan harian: sesi yang sudah masuk, slot yang belum, dan topik hari itu yang sudah digabung dan diberi skor peluang (permintaan tinggi, persaingan rendah, keyakinan naik bila muncul di beberapa sesi/model). Tren dibandingkan dengan 7 hari sebelumnya.",
      inputSchema: { platform: platformSchema, day: dateSchema.default(() => studioToday()) },
    },
    run(async (a: { platform: PlatformArg; day: string }) => studio.getDailyMergeData(a.platform, a.day)),
  );

  server.registerTool(
    "get_rollup_data",
    {
      description:
        "Data untuk rollup weekly/monthly/yearly: periode kalender (minggu = Senin-Minggu), laporan anak yang harus dirujuk, topik naik/turun dibanding periode sebelumnya, dan performa penjualan per keyword pada periode itu.",
      inputSchema: {
        level: z.enum(["weekly", "monthly", "yearly"]),
        platform: platformSchema,
        day: dateSchema.describe("Tanggal mana pun di dalam periode yang dimaksud"),
      },
    },
    run(async (a: { level: "weekly" | "monthly" | "yearly"; platform: PlatformArg; day: string }) =>
      studio.getRollupData(a.level, a.platform, a.day),
    ),
  );

  server.registerTool(
    "publish_report",
    {
      description:
        "Terbitkan laporan riset. Periode harus sesuai kalender (daily: 1 hari; weekly: Senin-Minggu; monthly: tanggal 1 s/d akhir bulan; yearly: 1 Jan-31 Des) dan hanya satu laporan per periode. daily otomatis membuka siklus produksi. Rollup wajib child_report_ids dari level di bawahnya.",
      inputSchema: {
        level: levelSchema,
        platform: platformSchema,
        period_start: dateSchema,
        period_end: dateSchema,
        summary: z.string().min(20),
        opportunities: z.array(opportunitySchema).default([]),
        finding_ids: z.array(z.string().uuid()).default([]),
        child_report_ids: z.array(z.string().uuid()).default([]),
      },
    },
    run(
      async (a: {
        level: LevelArg;
        platform: PlatformArg;
        period_start: string;
        period_end: string;
        summary: string;
        opportunities: unknown[];
        finding_ids: string[];
        child_report_ids: string[];
      }) => {
        if (a.level === "daily" && a.opportunities.length === 0) {
          throw new studio.StudioError("Laporan harian wajib berisi opportunities untuk Shion.");
        }
        return studio.publishReport({
          level: a.level,
          platform: a.platform,
          periodStart: a.period_start,
          periodEnd: a.period_end,
          summary: a.summary,
          opportunities: a.opportunities,
          findingIds: a.finding_ids,
          childReportIds: a.child_report_ids,
        });
      },
    ),
  );

  server.registerTool(
    "get_performance_summary",
    {
      description: "Penjualan N hari terakhir: total, per hari, aset terlaris, dan keyword yang laku/ditolak.",
      inputSchema: { platform: platformSchema, days: z.number().int().min(1).max(366).default(30) },
    },
    run(async (a: { platform: PlatformArg; days: number }) => studio.performanceOverview(a.platform, a.days)),
  );

  if (agent.role === "admin") {
    server.registerTool(
      "import_performance_csv",
      {
        description:
          "Impor CSV penjualan (kolom nama file, tanggal, downloads dan/atau revenue). Dicocokkan ke publikasi lewat nama file; impor ulang hari yang sama menimpa, tidak menggandakan.",
        inputSchema: { platform: platformSchema, csv: z.string().min(10) },
      },
      run(async (a: { platform: PlatformArg; csv: string }) => {
        const { rows, errors } = parsePerformanceCsv(a.csv);
        if (!rows.length) throw new studio.StudioError(errors.join("\n") || "Tidak ada baris yang bisa diimpor");
        return { ...(await studio.importPerformance(a.platform, rows)), parseErrors: errors };
      }),
    );
  }
}
