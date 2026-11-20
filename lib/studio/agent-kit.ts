/**
 * What to paste into each agent's chat app (Claude, ChatGPT, Grok...) to run it over MCP, plus
 * the suggested schedule. Prompts live in agent-prompts*.ts; rules and rubrics stay on the
 * server (get_playbook, get_rubric), so the pasted prompt does not go stale.
 */
import type { AgentRole } from "@/lib/db/schema";
import { PROMPT_RINA, PROMPT_RINA_SCOUT, PROMPT_SHION } from "./agent-prompts";
import { PROMPT_KECHLYN, PROMPT_LINDA_IMAGE, PROMPT_LINDA_REELS, PROMPT_LUKAS } from "./agent-prompts-review";

export type AgentKit = {
  schedule: string;
  app: string;
  prompt: string;
  /** Suggested run times (WIB) for a studio webhook trigger. */
  times: string;
  /** More prompts when one agent runs in two apps (Linda: images and reels). */
  extraPrompts?: { label: string; prompt: string }[];
};

export const AGENT_KITS: Record<Exclude<AgentRole, "admin">, AgentKit> = {
  rina_scout: {
    schedule: "3x sehari: 06.30, 12.30, dan 18.30 WIB",
    app: "Grok (tren real-time X dan berita)",
    prompt: PROMPT_RINA_SCOUT,
    times: "06:30, 12:30, 18:30",
  },
  rina: {
    schedule: "1x sehari: 20.00 WIB (setelah pindaian malam), rollup ikut di shift yang sama",
    app: "Claude (riset mendalam + verifikasi sumber)",
    prompt: PROMPT_RINA,
    times: "20:00",
  },
  shion: {
    schedule: "Tiap 2 jam",
    app: "ChatGPT",
    prompt: PROMPT_SHION,
    times: "07:00, 09:00, 11:00, 13:00, 15:00, 17:00, 21:00, 23:00",
  },
  lukas: {
    schedule: "Tiap 2 jam, 30 menit setelah Shion",
    app: "Claude",
    prompt: PROMPT_LUKAS,
    times: "07:30, 09:30, 11:30, 13:30, 15:30, 17:30, 21:30, 23:30",
  },
  linda: {
    schedule: "Tiap 2 jam (reels butuh waktu render)",
    app: "Gemini / GPT Image untuk gambar, Claude untuk reels (dua aplikasi, token Linda yang sama)",
    prompt: PROMPT_LINDA_IMAGE,
    extraPrompts: [{ label: "Prompt reels (Claude)", prompt: PROMPT_LINDA_REELS }],
    times: "08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 22:00",
  },
  kechlyn: {
    schedule: "Tiap 2 jam, 1 jam setelah Linda",
    app: "Claude (dengan kemampuan melihat gambar)",
    prompt: PROMPT_KECHLYN,
    times: "09:00, 11:00, 13:00, 15:00, 17:00, 19:00, 23:00",
  },
};

export const CRON_HINT = {
  schedule: "Tiap 15–30 menit",
  how: "Panggil GET /api/cron/tick dengan header Authorization: Bearer <CRON_SECRET> dari penjadwal mana pun (Vercel Cron, cron server, GitHub Actions, atau Task Scheduler Windows).",
};
