/**
 * Adobe Stock metadata rules and CSV export.
 * https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html
 */
import { ADOBE_CATEGORIES, PLATFORM_SPECS } from "./config";

const spec = PLATFORM_SPECS.adobe_stock;

/** Words Adobe does not allow in titles/keywords for generative AI content. */
const BANNED_TERMS = ["generative ai", "ai generated", "midjourney", "dall-e", "dalle", "stable diffusion", "firefly"];

export type AdobeMetadataInput = {
  title: string;
  keywords: string[];
  category?: string | number | null;
};

export type AdobeMetadata = {
  title: string;
  keywords: string[];
  category: number;
};

/** Trims, lowercases and de-duplicates keywords while keeping their relevance order. */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** Validates and normalises metadata, or throws with every problem listed. */
export function validateAdobeMetadata(input: AdobeMetadataInput): AdobeMetadata {
  const problems: string[] = [];
  const title = input.title.trim().replace(/\s+/g, " ");
  const keywords = normalizeKeywords(input.keywords);

  if (!title) problems.push("Judul wajib diisi");
  if (title.length > spec.maxTitleLength) {
    problems.push(`Judul ${title.length} karakter, maksimal ${spec.maxTitleLength}`);
  }
  if (title.includes(",")) problems.push("Judul tidak boleh mengandung koma (aturan CSV Adobe)");

  if (keywords.length < spec.minKeywords) problems.push(`Keyword minimal ${spec.minKeywords}, terkirim ${keywords.length}`);
  if (keywords.length > spec.maxKeywords) problems.push(`Keyword maksimal ${spec.maxKeywords}, terkirim ${keywords.length}`);
  const withComma = keywords.filter((k) => k.includes(","));
  if (withComma.length) problems.push(`Satu keyword tidak boleh berisi koma: ${withComma.join(" | ")}`);

  const text = `${title} ${keywords.join(" ")}`.toLowerCase();
  const banned = BANNED_TERMS.filter((t) => text.includes(t));
  if (banned.length) {
    problems.push(`Jangan sebut tool/label AI di judul atau keyword (${banned.join(", ")}); label AI dicentang di portal`);
  }

  const category = Number(input.category);
  if (!Number.isInteger(category) || !ADOBE_CATEGORIES[category]) {
    problems.push(
      `Kategori wajib berupa angka 1-21: ${Object.entries(ADOBE_CATEGORIES)
        .map(([n, name]) => `${n}=${name}`)
        .join(", ")}`,
    );
  }

  if (problems.length) throw new Error(`Metadata Adobe tidak valid:\n- ${problems.join("\n- ")}`);
  return { title, keywords, category };
}

/**
 * File name for upload and the CSV row. Adobe matches CSV rows to uploads by exact name,
 * max 30 characters including the extension.
 */
export function adobeFileName(title: string, publicationId: string): string {
  const id = publicationId.replace(/-/g, "").slice(0, 8);
  const room = spec.maxFileNameLength - id.length - "-.jpg".length;
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, room)
    .replace(/-+$/g, "");
  return slug ? `${slug}-${id}.jpg` : `${id}.jpg`;
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV in Adobe's template format (header row must stay in English). */
export function buildAdobeCsv(
  rows: { fileName: string; title: string; keywords: string[]; category: string | number | null }[],
): string {
  const lines = ["Filename,Title,Keywords,Category,Releases"];
  for (const r of rows) {
    lines.push(
      [r.fileName, r.title, r.keywords.join(", "), r.category == null ? "" : String(r.category), ""]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
