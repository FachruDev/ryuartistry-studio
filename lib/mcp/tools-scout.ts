/**
 * Trend-scan tools. Rina-Scout (Grok) submits quick scans; Rina (Claude) reads them as input for
 * deep research. Scans never become findings or reports, so the scout cannot open a cycle.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { studioToday } from "@/lib/studio/research-periods";
import * as studio from "@/lib/studio/service";
import { dateSchema, platformSchema, run, type PlatformArg } from "./helpers";

const signalSchema = z.object({
  topic: z.string().min(2),
  why: z.string().min(5).describe("Kenapa sedang naik sekarang: event, unggahan viral, musim, berita"),
  keywords: z.array(z.string()).min(2),
  momentum: z.number().int().min(1).max(10).describe("Seberapa cepat naik; 10 = meledak hari ini"),
  sources: z
    .array(z.object({ url: z.string().url(), accessedAt: z.string() }))
    .default([])
    .describe("Link postingan/berita yang menunjukkan tren ini"),
});

export function registerScoutTools(server: McpServer, agent: studio.Agent) {
  if (agent.role === "rina_scout") {
    server.registerTool(
      "get_research_schedule",
      {
        description:
          "Slot pindaian tren yang belum diisi hari ini (zona waktu Asia/Jakarta: slot 1 pagi, 2 siang, 3 malam). Panggil ini di awal setiap shift.",
        inputSchema: { platform: platformSchema },
      },
      run(async ({ platform }: { platform: PlatformArg }) => studio.getResearchSchedule(platform, new Date(), "rina_scout")),
    );
  }

  if (agent.role !== "rina") {
    server.registerTool(
      "submit_trend_scan",
      {
        description:
          "Kirim satu pindaian tren cepat untuk satu slot: 3-15 sinyal yang sedang naik hari ini (topik, alasan, keyword, momentum, sumber). Satu pindaian per platform per slot. Pindaian bukan hasil riset: Rina (Claude) yang memverifikasi dan menilainya.",
        inputSchema: {
          platform: platformSchema,
          day: dateSchema.default(() => studioToday()),
          slot: z.number().int().min(1).max(3),
          model: z.string().default("grok").describe("Model yang memindai, mis. grok"),
          notes: z.string().optional(),
          signals: z.array(signalSchema).min(3).max(15),
        },
      },
      run(async (a: Parameters<typeof studio.submitTrendScan>[1]) => studio.submitTrendScan(agent, a)),
    );
  }

  server.registerTool(
    "get_trend_scans",
    {
      description: "Pindaian tren dari Rina-Scout pada satu hari (semua slot), lengkap dengan sinyal dan sumbernya.",
      inputSchema: { platform: platformSchema, day: dateSchema.default(() => studioToday()) },
    },
    run(async (a: { platform: PlatformArg; day: string }) => studio.listTrendScans(a.platform, a.day)),
  );
}
