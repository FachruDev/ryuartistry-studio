import type { Platform } from "@/lib/db/schema";
import { PLATFORM_SPECS } from "./config";

export type AssetFacts = {
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

/**
 * Technical checks from docs/design.md §4.4.
 *
 * Phase 0 limitation: width/height/duration are the values Linda declares when submitting.
 * Phase 1 replaces them with values read from the file itself (image decoder / ffprobe).
 */
export function runAutoCheck(platform: Platform, a: AssetFacts): { passed: boolean; problems: string[] } {
  const problems: string[] = [];

  if (a.bytes <= 0) problems.push("File kosong");

  if (platform === "adobe_stock") {
    const spec = PLATFORM_SPECS.adobe_stock;
    if (!(spec.contentTypes as readonly string[]).includes(a.contentType)) {
      problems.push(`Format harus ${spec.contentTypes.join("/")}, bukan ${a.contentType}`);
    }
    if (!a.width || !a.height) {
      problems.push("Lebar dan tinggi gambar wajib diisi");
    } else {
      const mp = (a.width * a.height) / 1_000_000;
      if (mp < spec.minMegapixels) {
        problems.push(`Resolusi ${mp.toFixed(2)} MP, minimal ${spec.minMegapixels} MP (perlu upscale)`);
      }
    }
  } else {
    const spec = PLATFORM_SPECS.facebook_reels;
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
  }

  return { passed: problems.length === 0, problems };
}
