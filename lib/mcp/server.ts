import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentRole } from "@/lib/db/schema";
import { PLAYBOOKS } from "@/lib/studio/playbooks";
import { RUBRICS, getRubric } from "@/lib/studio/rubrics";
import * as studio from "@/lib/studio/service";
import { levelSchema, platformSchema, run } from "./helpers";
import { registerResearchTools } from "./tools-research";

type Agent = studio.Agent;
type Role = AgentRole;

const reviewShape = {
  job_id: z.string().uuid(),
  gates: z.record(z.string(), z.boolean()).describe("Setiap gate di rubrik: true jika lulus"),
  scores: z.record(z.string(), z.number().int().min(1).max(10)).describe("Skor 1-10 per kriteria rubrik"),
  feedback: z
    .record(z.string(), z.string())
    .describe("Masukan per kriteria/gate. Wajib untuk skor < 8 dan gate gagal; minimal satu saran walau lolos"),
  summary: z.string().min(1).describe("Ringkasan penilaian untuk eksekutor"),
};

const ROLE_INTRO: Record<Role, string> = {
  rina: "Kamu Rina, agen riset pasar. Mulai setiap shift dengan get_research_schedule dan kerjakan semua yang jatuh tempo: sesi riset, laporan harian (membuka siklus produksi), dan rollup.",
  shion: "Kamu Shion, pembuat ide/skenario. Ambil job dengan get_next_job, baca riset, review sebelumnya, dan idea_graveyard, lalu kirim ide atau storyboard.",
  lukas: "Kamu Lukas, reviewer ide. Ambil job, nilai dengan rubrik yang disertakan, dan selalu beri masukan konkret.",
  linda: "Kamu Linda, eksekutor. Ambil job, baca brief dan semua feedback, buat aset, upload lewat create_asset_upload, lalu submit_asset.",
  kechlyn: "Kamu Kechlyn, reviewer akhir dan manajer publikasi. Nilai aset dengan rubrik; jika tidak lolos wajib diagnosis. Setelah lolos, siapkan metadata publikasi.",
  admin: "Token admin: semua tools tersedia untuk pengujian dan operasi manual.",
};

export function createStudioServer(agent: Agent): McpServer {
  const server = new McpServer(
    { name: "ryuartistry-studio", version: "0.1.0" },
    { instructions: `${ROLE_INTRO[agent.role]} Panggil get_playbook di awal setiap shift. Aturan alur (batas revisi, routing, skor lolos) ditegakkan server; ikuti nextStatus di setiap hasil.` },
  );
  const can = (...roles: Role[]) => agent.role === "admin" || roles.includes(agent.role);

  // --- Common --------------------------------------------------------------
  server.registerTool(
    "whoami",
    { description: "Identitas dan peran token ini." },
    run(async () => ({ name: agent.name, role: agent.role, model: agent.model })),
  );

  server.registerTool(
    "get_playbook",
    {
      description: "Instruksi kerja satu shift untuk peranmu. Panggil ini di awal setiap shift.",
      inputSchema: {
        role: z.enum(["rina", "shion", "lukas", "linda", "kechlyn", "admin"]).optional().describe("Default: peran token ini"),
      },
    },
    async ({ role }: { role?: Role }) => ({
      content: [{ type: "text" as const, text: PLAYBOOKS[role && agent.role === "admin" ? role : agent.role] }],
    }),
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
          "Kirim naskah + storyboard reels untuk job berstatus storyboard_pending. Wajib: hook (apa yang terjadi di 3 detik pertama) dan scenes [{ duration_sec, visual, narration dan/atau on_screen_text }]. Total durasi 30-60 detik, scene pertama maksimal 5 detik. Opsional: music_mood, cta, voice_style. Server menolak storyboard yang tidak memenuhi ini sebelum Lukas menilainya.",
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
          "Kirim aset yang sudah di-upload. Server membaca file langsung. Gambar: JPEG, sRGB, 4-100 MP, maks 45 MB. Reels: MP4 H.264 + AAC, 9:16 vertikal, lebar minimal 1080 px, 30-60 detik, 23-60 fps, loudness sekitar -14 LUFS (-18 s/d -10), true peak maksimal -1 dBTP, maks 300 MB. Keduanya dicek kemiripan dengan aset lain. Hasil: diteruskan ke Kechlyn atau dikembalikan untuk revisi.",
        inputSchema: {
          job_id: z.string().uuid(),
          s3_key: z.string(),
          content_type: z.enum(["image/jpeg", "image/png", "video/mp4"]),
          width: z.number().int().positive().optional().describe("Untuk gambar dibaca dari file; wajib untuk video"),
          height: z.number().int().positive().optional().describe("Untuk gambar dibaca dari file; wajib untuk video"),
          duration_sec: z.number().positive().optional().describe("Wajib untuk video"),
          notes: z.string().optional().describe("Catatan untuk Kechlyn: tool, prompt, perubahan dari versi sebelumnya"),
        },
      },
      run(
        async (a: {
          job_id: string;
          s3_key: string;
          content_type: string;
          width?: number;
          height?: number;
          duration_sec?: number;
          notes?: string;
        }) =>
          studio.submitAsset(agent, a.job_id, {
            s3Key: a.s3_key,
            contentType: a.content_type,
            width: a.width ?? null,
            height: a.height ?? null,
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
          "Siapkan metadata publikasi untuk job berstatus publish_prep (hanya setelah aset lolos). Adobe Stock: judul bahasa Inggris maks 70 karakter tanpa koma; 5-49 keyword diurutkan dari yang paling relevan (10 teratas paling penting); kategori angka 1-21 (lihat adobeCategories di get_job); jangan sebut nama tool AI. Reels: title internal, caption (kalimat pertama memancing orang menonton sampai habis, maks 2200 karakter), maks 10 hashtag, scheduled_for opsional. ai_label wajib true.",
        inputSchema: {
          job_id: z.string().uuid(),
          title: z.string().min(3),
          caption: z.string().optional(),
          keywords: z.array(z.string()).default([]),
          hashtags: z.array(z.string()).default([]),
          category: z.union([z.string(), z.number().int()]).transform(String).optional(),
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
  if (can("rina")) registerResearchTools(server, agent);

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
