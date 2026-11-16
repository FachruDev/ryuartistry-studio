/**
 * What to paste into each agent's chat app (Claude, ChatGPT, Grok...) to run it on a schedule
 * over MCP. The playbook itself is served by the server (get_playbook), so the scheduled
 * prompt stays short and never goes out of date.
 */
import type { AgentRole } from "@/lib/db/schema";

export type AgentKit = { schedule: string; app: string; prompt: string };

const base = (name: string, extra = "") =>
  `Kamu adalah ${name} di Ryuartistry Studio. Panggil tool get_playbook dari server MCP "ryuartistry-studio", lalu jalankan satu shift persis sesuai playbook.${extra} Jika sebuah tool mengembalikan error, baca pesannya dan perbaiki kirimanmu. Akhiri dengan ringkasan singkat: berapa job yang dikerjakan dan apa hasilnya.`;

export const AGENT_KITS: Record<Exclude<AgentRole, "admin">, AgentKit> = {
  rina: {
    schedule: "4x sehari: 06.30, 12.30, 18.30, dan 21.00 WIB",
    app: "Claude (riset + verifikasi) dan Grok (tren real-time X), masing-masing dengan token Rina",
    prompt: base(
      "Rina",
      " Mulai dengan get_research_schedule untuk adobe_stock lalu facebook_reels, kerjakan semua yang jatuh tempo. Sebutkan model kamu (claude atau grok) saat submit_research_session.",
    ),
  },
  shion: {
    schedule: "Tiap 1 jam",
    app: "ChatGPT",
    prompt: base("Shion", " Ulangi get_next_job dengan role shion sampai hasilnya null atau sudah 10 job."),
  },
  lukas: {
    schedule: "Tiap 1 jam, 15 menit setelah Shion",
    app: "Claude",
    prompt: base("Lukas", " Ulangi get_next_job dengan role lukas sampai hasilnya null atau sudah 10 job."),
  },
  linda: {
    schedule: "Tiap 2 jam (reels butuh waktu render)",
    app: "Gemini / GPT Image untuk gambar, Claude untuk reels (bisa dua jadwal dengan token Linda yang sama)",
    prompt: base("Linda", " Ulangi get_next_job dengan role linda sampai hasilnya null atau sudah 5 job."),
  },
  kechlyn: {
    schedule: "Tiap 1 jam, 30 menit setelah Linda",
    app: "Claude (dengan kemampuan melihat gambar)",
    prompt: base("Kechlyn", " Ulangi get_next_job dengan role kechlyn sampai hasilnya null atau sudah 10 job."),
  },
};

export const CRON_HINT = {
  schedule: "Tiap 15–30 menit",
  how: "Panggil GET /api/cron/tick dengan header Authorization: Bearer <CRON_SECRET> dari penjadwal mana pun (Vercel Cron, cron server, GitHub Actions, atau Task Scheduler Windows).",
};
