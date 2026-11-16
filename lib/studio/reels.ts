/** Facebook Reels rules: storyboard shape before production, metadata before posting. */
import { PLATFORM_SPECS } from "./config";

const spec = PLATFORM_SPECS.facebook_reels;

type Scene = { duration_sec?: unknown; visual?: unknown; narration?: unknown; on_screen_text?: unknown };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Checks a storyboard before Lukas spends a review on it: the total must fit the reel length,
 * the hook must exist, and every scene must say what is shown and what is said or written.
 */
export function validateStoryboard(content: Record<string, unknown>): { totalSec: number; problems: string[] } {
  const problems: string[] = [];
  const scenes = (Array.isArray(content.scenes) ? content.scenes : []) as Scene[];
  if (text(content.hook).length < 10) problems.push("hook (3 detik pertama) wajib dijelaskan, minimal 10 karakter");
  if (!scenes.length) problems.push("scenes wajib berisi minimal 1 scene");

  let total = 0;
  scenes.forEach((s, i) => {
    const d = Number(s.duration_sec);
    if (!Number.isFinite(d) || d <= 0) problems.push(`scene ${i + 1}: duration_sec harus angka positif`);
    else total += d;
    if (!text(s.visual)) problems.push(`scene ${i + 1}: visual wajib diisi (apa yang terlihat)`);
    if (!text(s.narration) && !text(s.on_screen_text)) {
      problems.push(`scene ${i + 1}: isi narration atau on_screen_text`);
    }
  });
  total = Math.round(total * 10) / 10;
  if (scenes.length && (total < spec.minDurationSec || total > spec.maxDurationSec)) {
    problems.push(`total durasi ${total} detik, harus ${spec.minDurationSec}-${spec.maxDurationSec} detik`);
  }
  const first = Number(scenes[0]?.duration_sec);
  if (Number.isFinite(first) && first > 5) problems.push("scene pertama maksimal 5 detik agar hook langsung terasa");
  return { totalSec: total, problems };
}

/** Normalises hashtags to "#tag" form, unique, in the given order. */
export function normalizeHashtags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const tag = `#${t.trim().replace(/^#+/, "").replace(/\s+/g, "")}`;
    if (tag.length > 1 && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

export function validateReelMetadata(input: { title: string; caption?: string; hashtags: string[] }) {
  const problems: string[] = [];
  const caption = (input.caption ?? "").trim();
  const hashtags = normalizeHashtags(input.hashtags);
  if (input.title.trim().length < 3) problems.push("Judul internal minimal 3 karakter");
  if (!caption) problems.push("Caption wajib diisi; kalimat pertama harus memancing orang menonton sampai habis");
  if (caption.length > spec.maxCaptionLength) problems.push(`Caption ${caption.length} karakter, maksimal ${spec.maxCaptionLength}`);
  if (hashtags.length > spec.maxHashtags) problems.push(`Hashtag ${hashtags.length}, maksimal ${spec.maxHashtags} (lebih banyak terlihat seperti spam)`);
  if (problems.length) throw new Error(`Metadata reels tidak valid:\n- ${problems.join("\n- ")}`);
  return { title: input.title.trim(), caption, hashtags };
}

/** File name for downloads: slug + short id, so a posted reel can be traced back. */
export function assetFileName(title: string, id: string, ext: string, maxLength = 40): string {
  const short = id.replace(/-/g, "").slice(0, 8);
  const room = maxLength - short.length - `-.${ext}`.length;
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, room)
    .replace(/-+$/g, "");
  return slug ? `${slug}-${short}.${ext}` : `${short}.${ext}`;
}
