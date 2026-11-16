import type { Platform } from "@/lib/db/schema";
import { PLATFORM_SPECS } from "./config";
import type { ImageFacts } from "./image-inspect";

export type AssetFacts = {
  contentType: string;
  bytes: number;
  /** Declared by Linda; for images these are replaced by `image` when available. */
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Properties read from the file itself (images only). */
  image?: ImageFacts;
  /** Closest earlier asset on the same platform, by dHash. */
  nearestDuplicate?: { assetId: string; distance: number } | null;
};

export type AutoCheckResult = { passed: boolean; problems: string[] };

/** Technical checks from docs/design.md §4.4. */
export function runAutoCheck(platform: Platform, a: AssetFacts): AutoCheckResult {
  const problems = platform === "adobe_stock" ? checkAdobeImage(a) : checkReel(a);
  if (a.bytes <= 0) problems.unshift("File kosong");
  return { passed: problems.length === 0, problems };
}

function checkAdobeImage(a: AssetFacts): string[] {
  const spec = PLATFORM_SPECS.adobe_stock;
  const problems: string[] = [];
  const img = a.image;

  if (!img || !img.format) {
    problems.push("File tidak bisa dibaca sebagai gambar");
    return problems;
  }
  if (img.format !== "jpeg") problems.push(`Format file ${img.format}, Adobe Stock butuh JPEG`);
  if (a.contentType !== "image/jpeg") problems.push(`Content type ${a.contentType}, harus image/jpeg`);
  if (img.space && !(spec.colorSpaces as readonly string[]).includes(img.space)) {
    problems.push(`Ruang warna ${img.space}, harus sRGB`);
  }
  if (a.bytes > spec.maxBytes) {
    problems.push(`Ukuran file ${(a.bytes / 1024 / 1024).toFixed(1)} MB, maksimal ${spec.maxBytes / 1024 / 1024} MB`);
  }

  if (img.width && img.height) {
    const mp = (img.width * img.height) / 1_000_000;
    if (mp < spec.minMegapixels) {
      problems.push(`Resolusi ${mp.toFixed(2)} MP (${img.width}x${img.height}), minimal ${spec.minMegapixels} MP (perlu upscale)`);
    } else if (mp > spec.maxMegapixels) {
      problems.push(`Resolusi ${mp.toFixed(2)} MP, maksimal ${spec.maxMegapixels} MP`);
    }
    if (a.width && a.height && (a.width !== img.width || a.height !== img.height)) {
      problems.push(`Ukuran yang dilaporkan (${a.width}x${a.height}) berbeda dengan file (${img.width}x${img.height})`);
    }
  }

  if (a.nearestDuplicate && a.nearestDuplicate.distance <= spec.duplicateMaxDistance) {
    problems.push(
      `Terlalu mirip dengan aset lain (${a.nearestDuplicate.assetId.slice(0, 8)}, jarak ${a.nearestDuplicate.distance}/64); Adobe bisa menganggapnya spam`,
    );
  }
  return problems;
}

/** Reels still use the declared values until Phase 3 adds ffprobe. */
function checkReel(a: AssetFacts): string[] {
  const spec = PLATFORM_SPECS.facebook_reels;
  const problems: string[] = [];
  if (!(spec.contentTypes as readonly string[]).includes(a.contentType)) {
    problems.push(`Format harus ${spec.contentTypes.join("/")}, bukan ${a.contentType}`);
  }
  if (a.width !== spec.width || a.height !== spec.height) {
    problems.push(`Ukuran harus ${spec.width}x${spec.height} (9:16), bukan ${a.width}x${a.height}`);
  }
  if (a.durationSec === null) {
    problems.push("Durasi wajib diisi");
  } else if (a.durationSec < spec.minDurationSec || a.durationSec > spec.maxDurationSec) {
    problems.push(`Durasi ${a.durationSec} detik, harus ${spec.minDurationSec}-${spec.maxDurationSec} detik`);
  }
  return problems;
}
