import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentRole } from "@/lib/db/schema";
import { RUBRICS, getRubric } from "@/lib/studio/rubrics";
import * as studio from "@/lib/studio/service";

type Agent = studio.Agent;
type Role = AgentRole;

const platformSchema = z.enum(["adobe_stock", "facebook_reels"]);
const levelSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

const reviewShape = {
  job_id: z.string().uuid(),
  gates: z.record(z.string(), z.boolean()).describe("Setiap gate di rubrik: true jika lulus"),
  scores: z.record(z.string(), z.number().int().min(1).max(10)).describe("Skor 1-10 per kriteria rubrik"),
  feedback: z
    .record(z.string(), z.string())
    .describe("Masukan per kriteria/gate. Wajib untuk skor < 8 dan gate gagal; minimal satu saran walau lolos"),
  summary: z.string().min(1).describe("Ringkasan penilaian untuk eksekutor"),
};

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Wraps a handler so domain errors come back to the agent as readable tool errors. */
function run<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      if (!(e instanceof studio.StudioError) && !(e instanceof Error && e.message.startsWith("Review tidak valid"))) {
        console.error("[mcp] tool error", e);
      }
      return fail(e);
    }
  };
}

const ROLE_INTRO: Record<Role, string> = {
  rina: "Kamu Rina, agen riset pasar. Simpan temuan terstruktur per sesi (3 sesi sehari), lalu gabungkan jadi laporan harian; laporan harian membuka siklus produksi.",
  shion: "Kamu Shion, pembuat ide/skenario. Ambil job dengan get_next_job, baca riset, review sebelumnya, dan idea_graveyard, lalu kirim ide atau storyboard.",
  lukas: "Kamu Lukas, reviewer ide. Ambil job, nilai dengan rubrik yang disertakan, dan selalu beri masukan konkret.",
  linda: "Kamu Linda, eksekutor. Ambil job, baca brief dan semua feedback, buat aset, upload lewat create_asset_upload, lalu submit_asset.",
  kechlyn: "Kamu Kechlyn, reviewer akhir dan manajer publikasi. Nilai aset dengan rubrik; jika tidak lolos wajib diagnosis. Setelah lolos, siapkan metadata publikasi.",
  admin: "Token admin: semua tools tersedia untuk pengujian dan operasi manual.",
};

export function createStudioServer(agent: Agent): McpServer {
  const server = new McpServer(
    { name: "ryuartistry-studio", version: "0.1.0" },
    { instructions: `${ROLE_INTRO[agent.role]} Aturan alur (batas revisi, routing, skor lolos) ditegakkan server; ikuti nextStatus di setiap hasil.` },
  );
  const can = (...roles: Role[]) => agent.role === "admin" || roles.includes(agent.role);

  // --- Common --------------------------------------------------------------
  server.registerTool(
    "whoami",
    { description: "Identitas dan peran token ini." },
    run(async () => ({ name: agent.name, role: agent.role, model: agent.model })),
  );

  server.registerTool(
    "get_rubric",
    {
      description: `Ambil rubrik penilaian. Tersedia: ${Object.keys(RUBRICS).join(", ")}.`,
      inputSchema: { rubric_id: z.string() },
    },
    run(async ({ rubric_id }: { rubric_id: string }) => getRubric(rubric_id)),
  );

  server.registerTool(
    "get_job",
    {
      description: "Konteks lengkap satu job: ide, review, riset, aset terbaru (URL unduh), rubrik, idea_graveyard.",
      inputSchema: { job_id: z.string().uuid() },
    },
    run(async ({ job_id }: { job_id: string }) => studio.getJobContext(job_id)),
  );

  server.registerTool(
    "report_cost",
    {
      description: "Catat perkiraan biaya (USD) pemakaian model/tool, opsional terkait job.",
      inputSchema: {
        job_id: z.string().uuid().optional(),
        description: z.string(),
        cost_usd: z.number().min(0),
      },
    },
    run(async (a: { job_id?: string; description: string; cost_usd: number }) => {
      await studio.reportCost(agent, { jobId: a.job_id, description: a.description, costUsd: a.cost_usd });
      return { recorded: true };
    }),
  );

  if (agent.role !== "rina") {
    const roles = agent.role === "admin" ? ["shion", "lukas", "linda", "kechlyn"] : [agent.role];
    server.registerTool(
      "get_next_job",
      {
        description:
          "Ambil (klaim 30 menit) job berikutnya untuk peranmu beserta konteks lengkapnya. Mengembalikan null jika antrian kosong.",
        inputSchema: { role: z.enum(roles as [string, ...string[]]).default(roles[0]) },
      },
      run(async ({ role }: { role: string }) =>
        studio.claimNextJob(agent, role as "shion" | "lukas" | "linda" | "kechlyn"),
      ),
    );
  }

  // --- Shion ----------------------------------------------------------------
  if (can("shion")) {
    server.registerTool(
      "submit_idea",
      {
        description:
          "Kirim ide (baru atau revisi) untuk job berstatus idea_pending/idea_revision. content wajib punya title; sertakan konsep, kegunaan bagi pembeli/penonton, gaya, komposisi, target keyword dari riset, dan prompt awal.",
        inputSchema: {
          job_id: z.string().uuid(),
          content: z
            .object({ title: z.string().min(3) })
            .catchall(z.unknown())
            .describe("Brief ide dalam bentuk objek JSON"),
        },
      },
      run(async (a: { job_id: string; content: Record<string, unknown> }) =>
        studio.submitIdea(agent, a.job_id, a.content),
      ),
    );

    server.registerTool(
      "submit_storyboard",
      {
        description:
          "Kirim naskah + storyboard reels untuk job berstatus storyboard_pending. Sertakan hook 3 detik pertama dan daftar scene (durasi, visual, narasi, teks layar), musik/mood, dan CTA.",
        inputSchema: {
          job_id: z.string().uuid(),
          content: z
            .object({
              hook: z.string(),
              scenes: z
                .array(z.object({ duration_sec: z.number().positive() }).catchall(z.unknown()))
                .min(1),
            })
            .catchall(z.unknown()),
        },
      },
      run(async (a: { job_id: string; content: Record<string, unknown> }) =>
        studio.submitStoryboard(agent, a.job_id, a.content),
      ),
    );
  }

  if (can("shion", "lukas", "rina")) {
    server.registerTool(
      "get_idea_graveyard",
      {
        description: "Ide yang pernah dibuang beserta alasannya. Hindari mengulang ide serupa.",
        inputSchema: { platform: platformSchema, limit: z.number().int().min(1).max(200).default(50) },
      },
      run(async (a: { platform: "adobe_stock" | "facebook_reels"; limit: number }) =>
        studio.getIdeaGraveyard(a.platform, a.limit),
      ),
    );
  }

  if (can("shion", "rina")) {
    server.registerTool(
      "get_research",
      {
        description: "Laporan riset terbaru per level (daily/weekly/monthly/yearly).",
        inputSchema: { platform: platformSchema, level: levelSchema, limit: z.number().int().min(1).max(31).default(3) },
      },
      run(async (a: { platform: "adobe_stock" | "facebook_reels"; level: "daily" | "weekly" | "monthly" | "yearly"; limit: number }) =>
        studio.listResearch(a),
      ),
    );
  }

  // --- Lukas ----------------------------------------------------------------
  if (can("lukas")) {
    server.registerTool(
      "submit_idea_review",
      {
        description:
          "Nilai ide (status idea_review) atau storyboard (status storyboard_review) dengan rubrik idea/storyboard. Skor akhir dihitung server. Jika job dikembalikan dari eksekusi, kirim review tidak lolos berisi arahan revisi berdasarkan diagnosis Kechlyn.",
        inputSchema: reviewShape,
      },
      run(async (a: z.infer<z.ZodObject<typeof reviewShape>>) =>
        studio.submitIdeaReview(agent, a.job_id, a),
      ),
    );
  }

  // --- Linda ----------------------------------------------------------------
  if (can("linda")) {
    server.registerTool(
      "create_asset_upload",
      {
        description:
          "Minta URL upload (PUT) untuk aset job berstatus executing/exec_revision. Upload file ke uploadUrl dengan header Content-Type yang sama, lalu panggil submit_asset dengan s3Key.",
        inputSchema: { job_id: z.string().uuid(), content_type: z.enum(["image/jpeg", "image/png", "video/mp4"]) },
      },
      run(async (a: { job_id: string; content_type: string }) =>
        studio.createAssetUpload(agent, a.job_id, a.content_type),
      ),
    );

    server.registerTool(
      "submit_asset",
      {
        description:
          "Kirim aset yang sudah di-upload. Server menjalankan cek teknis (resolusi/format/durasi) lalu meneruskan ke Kechlyn atau mengembalikannya untuk revisi.",
        inputSchema: {
          job_id: z.string().uuid(),
          s3_key: z.string(),
          content_type: z.enum(["image/jpeg", "image/png", "video/mp4"]),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          duration_sec: z.number().positive().optional().describe("Wajib untuk video"),
          notes: z.string().optional().describe("Catatan untuk Kechlyn: tool, prompt, perubahan dari versi sebelumnya"),
        },
      },
      run(
        async (a: {
          job_id: string;
          s3_key: string;
          content_type: string;
          width: number;
          height: number;
          duration_sec?: number;
          notes?: string;
        }) =>
          studio.submitAsset(agent, a.job_id, {
            s3Key: a.s3_key,
            contentType: a.content_type,
            width: a.width,
            height: a.height,
            durationSec: a.duration_sec ?? null,
            notes: a.notes,
          }),
      ),
    );
  }

  // --- Kechlyn --------------------------------------------------------------
  if (can("kechlyn")) {
    server.registerTool(
      "submit_asset_review",
      {
        description:
          "Nilai aset (status final_review) dengan rubrik asset-image/asset-reel. Jika tidak lolos, wajib diagnosis: execution (kembali ke Linda), infeasible atau weak_idea (kembali ke Lukas).",
        inputSchema: {
          ...reviewShape,
          diagnosis: z.enum(["execution", "infeasible", "weak_idea"]).nullable().default(null),
        },
      },
      run(
        async (
          a: z.infer<z.ZodObject<typeof reviewShape>> & { diagnosis: "execution" | "infeasible" | "weak_idea" | null },
        ) => studio.submitAssetReview(agent, a.job_id, a),
      ),
    );

    server.registerTool(
      "submit_publication_prep",
      {
        description:
          "Siapkan metadata publikasi untuk job berstatus publish_prep (hanya setelah aset lolos). Adobe: judul bahasa Inggris, maks 49 keyword (10 teratas paling penting), kategori. Reels: caption, hashtag, jadwal. ai_label wajib true.",
        inputSchema: {
          job_id: z.string().uuid(),
          title: z.string().min(3),
          caption: z.string().optional(),
          keywords: z.array(z.string()).default([]),
          hashtags: z.array(z.string()).default([]),
          category: z.string().optional(),
          ai_label: z.boolean(),
          scheduled_for: z.string().datetime({ offset: true }).optional(),
        },
      },
      run(
        async (a: {
          job_id: string;
          title: string;
          caption?: string;
          keywords: string[];
          hashtags: string[];
          category?: string;
          ai_label: boolean;
          scheduled_for?: string;
        }) =>
          studio.submitPublicationPrep(agent, a.job_id, {
            title: a.title,
            caption: a.caption,
            keywords: a.keywords,
            hashtags: a.hashtags,
            category: a.category,
            aiLabel: a.ai_label,
            scheduledFor: a.scheduled_for,
          }),
      ),
    );
  }

  // --- Rina -----------------------------------------------------------------
  if (can("rina")) {
    server.registerTool(
      "submit_research_session",
      {
        description:
          "Simpan satu sesi riset (slot 1=pagi, 2=siang, 3=malam) beserta temuan terstruktur. Temuan tanpa sumber ditandai belum terverifikasi.",
        inputSchema: {
          platform: platformSchema,
          day: dateSchema,
          slot: z.number().int().min(1).max(3),
          model: z.string().describe("Model yang melakukan riset, mis. claude / grok"),
          notes: z.string().optional(),
          findings: z.array(
            z.object({
              topic: z.string(),
              keywords: z.array(z.string()).min(1),
              demandScore: z.number().int().min(1).max(10),
              competitionScore: z.number().int().min(1).max(10).describe("Rendah = sedikit pesaing = peluang"),
              seasonality: z.string().describe('"evergreen" atau tanggal/nama event'),
              sources: z.array(z.object({ url: z.string().url(), accessedAt: z.string() })),
              confidence: z.number().int().min(1).max(10),
              notes: z.string().optional(),
            }),
          ),
        },
      },
      run(async (a: Parameters<typeof studio.submitResearchSession>[1]) => studio.submitResearchSession(agent, a)),
    );

    server.registerTool(
      "list_findings",
      {
        description: "Semua temuan pada satu hari (dari ketiga sesi), untuk digabung menjadi laporan harian.",
        inputSchema: { platform: platformSchema, day: dateSchema },
      },
      run(async (a: { platform: "adobe_stock" | "facebook_reels"; day: string }) => studio.listFindings(a)),
    );

    server.registerTool(
      "publish_report",
      {
        description:
          "Terbitkan laporan riset. daily: gabungan 3 sesi hari itu, otomatis membuka siklus produksi. weekly/monthly/yearly: rollup dari laporan di bawahnya (isi child_report_ids). opportunities = daftar peluang terstruktur untuk Shion.",
        inputSchema: {
          level: levelSchema,
          platform: platformSchema,
          period_start: dateSchema,
          period_end: dateSchema,
          summary: z.string().min(1),
          opportunities: z.array(z.record(z.string(), z.unknown())).default([]),
          finding_ids: z.array(z.string().uuid()).default([]),
          child_report_ids: z.array(z.string().uuid()).default([]),
        },
      },
      run(
        async (a: {
          level: "daily" | "weekly" | "monthly" | "yearly";
          platform: "adobe_stock" | "facebook_reels";
          period_start: string;
          period_end: string;
          summary: string;
          opportunities: unknown[];
          finding_ids: string[];
          child_report_ids: string[];
        }) =>
          studio.publishReport({
            level: a.level,
            platform: a.platform,
            periodStart: a.period_start,
            periodEnd: a.period_end,
            summary: a.summary,
            opportunities: a.opportunities,
            findingIds: a.finding_ids,
            childReportIds: a.child_report_ids,
          }),
      ),
    );
  }

  // --- Admin ----------------------------------------------------------------
  if (agent.role === "admin") {
    server.registerTool(
      "open_cycle",
      {
        description: "Buka satu siklus produksi secara manual (untuk pengujian tanpa laporan riset).",
        inputSchema: { platform: platformSchema, research_report_id: z.string().uuid().optional() },
      },
      run(async (a: { platform: "adobe_stock" | "facebook_reels"; research_report_id?: string }) => ({
        cycleIds: await studio.openCycleManually(a.platform, a.research_report_id ?? null),
      })),
    );
  }

  return server;
}
