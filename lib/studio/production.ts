/**
 * How Linda produces assets, in one place so Shion's briefs, Lukas's feasibility check, the
 * playbooks and Linda's own prompts all describe the same tools. The studio runs on Claude and
 * Grok only: Linda is Claude (Claude Code routine), images with Claude Design (/design), reels
 * with motlab (/motlab, motion graphics as code) and an ElevenLabs voiceover.
 */

/** Voiceover for reels. Override with STUDIO_REELS_VOICE_ID / STUDIO_REELS_VOICE_NAME. */
export const REELS_VOICE = {
  provider: "ElevenLabs",
  name: process.env.STUDIO_REELS_VOICE_NAME?.trim() || "Lauren - Calm, clear, friendly",
  voiceId: process.env.STUDIO_REELS_VOICE_ID?.trim() || "X1amM3LR8OIq8LP92VpO",
  /** Alternative with more creator energy, if the channel wants it. */
  alternative: { name: "Lauren B – Gen-Z Influencer, Feels Real", voiceId: "EQymf553LnGArWPRBol1" },
  model: "eleven_v4",
  language: "English (British accent)",
};

/** What an image brief can ask for: designed graphics, not photographs. */
export const IMAGE_CAPABILITY =
  "Gambar dibuat Linda dengan Claude Design (/design): desain grafis berbasis kode yang dirender ke JPEG. Cocok: ilustrasi vektor/flat, pola dan tekstur, background abstrak/gradien, bentuk geometris, ikon dan set ikon, ilustrasi konsep bisnis/teknologi, kartu/undangan/poster tanpa merek, infografis tanpa data asli, isometrik. Tidak bisa: foto realistis orang, hewan, tempat, atau produk nyata.";

/** What a reel storyboard can ask for: motion graphics and an AI voiceover. */
export const REEL_CAPABILITY = `Reels dibuat Linda dengan motlab (/motlab): motion graphics berbasis kode, tanpa video atau gambar AI. Cocok: tipografi kinetik, ikon dan ilustrasi beranimasi, diagram/grafik, peta sederhana, transisi bentuk, subtitle. Tidak bisa: rekaman kamera/footage nyata atau wajah manusia realistis. Narasi memakai suara ${REELS_VOICE.provider} "${REELS_VOICE.name}" (${REELS_VOICE.language}); sekitar 2,5 kata per detik, jadi 60 detik ≈ 150 kata.`;
