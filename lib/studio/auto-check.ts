import type { Platform } from "@/lib/db/schema";
import { PLATFORM_SPECS } from "./config";
import type { ImageFacts } from "./image-inspect";
import type { VideoFacts } from "./video-probe";

export type AssetFacts = {
  contentType: string;
  bytes: number;
  /** Declared by Linda; replaced by `image` / `video` facts read from the file. */
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Properties read from the file itself. */
  image?: ImageFacts;
  video?: VideoFacts;
  /** Set when the file could not be inspected at all. */
  inspectError?: string;
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

/** Reels: every value comes from ffprobe/ffmpeg on the uploaded file. */
function checkReel(a: AssetFacts): string[] {
  const spec = PLATFORM_SPECS.facebook_reels;
  const problems: string[] = [];
  const v = a.video;
  if (a.inspectError || !v || !v.videoCodec) {
    problems.push(a.inspectError ?? "File tidak bisa dibaca sebagai video");
    return problems;
  }
  if (a.contentType !== "video/mp4" || !v.container?.includes("mp4")) {
    problems.push(`Kontainer harus MP4 (terbaca: ${v.container ?? "?"})`);
  }
  if (a.bytes > spec.maxBytes) problems.push(`Ukuran file ${(a.bytes / 1024 / 1024).toFixed(0)} MB, maksimal ${spec.maxBytes / 1024 / 1024} MB`);

  if (v.width && v.height) {
    const ratio = v.width / v.height;
    if (Math.abs(ratio - spec.aspectRatio) > spec.aspectTolerance) {
      problems.push(`Rasio ${v.width}x${v.height} bukan 9:16 vertikal`);
    } else if (v.width < spec.minWidth) {
      problems.push(`Lebar ${v.width}px, minimal ${spec.minWidth}px (disarankan 1080x1920)`);
    }
  }
  if (v.durationSec == null || v.durationSec < spec.minDurationSec || v.durationSec > spec.maxDurationSec) {
    problems.push(`Durasi ${v.durationSec ?? "?"} detik, harus ${spec.minDurationSec}-${spec.maxDurationSec} detik`);
  }
  if (v.fps != null && (v.fps < spec.minFps || v.fps > spec.maxFps)) problems.push(`Frame rate ${v.fps} fps, harus ${spec.minFps}-${spec.maxFps}`);
  if (!(spec.videoCodecs as readonly string[]).includes(v.videoCodec)) problems.push(`Codec video ${v.videoCodec}, harus H.264`);

  if (!v.hasAudio) {
    problems.push("Tidak ada audio; reels butuh voiceover atau musik");
  } else {
    if (v.audioCodec && !(spec.audioCodecs as readonly string[]).includes(v.audioCodec)) problems.push(`Codec audio ${v.audioCodec}, harus AAC`);
    if (v.loudnessLufs == null) {
      problems.push("Audio hening (loudness tidak terukur)");
    } else if (v.loudnessLufs < spec.minLoudnessLufs) {
      problems.push(`Audio terlalu pelan (${v.loudnessLufs} LUFS), targetkan sekitar -14 LUFS`);
    } else if (v.loudnessLufs > spec.maxLoudnessLufs) {
      problems.push(`Audio terlalu keras (${v.loudnessLufs} LUFS), targetkan sekitar -14 LUFS`);
    }
    if (v.truePeakDb != null && v.truePeakDb > spec.maxTruePeakDb) {
      problems.push(`True peak ${v.truePeakDb} dBTP, maksimal ${spec.maxTruePeakDb} (berisiko clipping)`);
    }
  }

  if (a.nearestDuplicate && a.nearestDuplicate.distance <= spec.duplicateMaxDistance) {
    problems.push(
      `Terlalu mirip dengan reel lain (${a.nearestDuplicate.assetId.slice(0, 8)}, jarak rata-rata ${a.nearestDuplicate.distance}/64); Meta bisa menganggapnya konten tidak orisinal`,
    );
  }
  return problems;
}
