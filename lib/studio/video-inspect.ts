/**
 * Reads the real properties of a reel with ffprobe/ffmpeg (must be installed on the server;
 * override paths with FFPROBE_PATH / FFMPEG_PATH). Also cuts three keyframes into a contact
 * sheet so a reviewer that cannot play video still sees the reel.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { downloadToFile } from "@/lib/storage";
import { differenceHash } from "./image-inspect";
import { parseLoudness, parseProbe, type VideoFacts } from "./video-probe";

const run = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const TIMEOUT = 120_000;
/** Frames sampled at these fractions of the duration; the first sits inside the 3-second hook. */
const FRAME_AT = [0.05, 0.5, 0.9];
const THUMB_WIDTH = 360;

export type VideoInspection = { facts: VideoFacts; contactSheet: Buffer | null; error?: string };

async function frameAt(file: string, seconds: number): Promise<Buffer> {
  const { stdout } = await run(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-ss", seconds.toFixed(2), "-i", file, "-frames:v", "1", "-vf", `scale=${THUMB_WIDTH}:-2`, "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"],
    { encoding: "buffer", timeout: TIMEOUT, maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

async function contactSheet(frames: Buffer[]): Promise<Buffer> {
  const metas = await Promise.all(frames.map((f) => sharp(f).metadata()));
  const h = Math.max(...metas.map((m) => m.height ?? 0));
  const gap = 8;
  return sharp({
    create: { width: THUMB_WIDTH * frames.length + gap * (frames.length + 1), height: h + gap * 2, channels: 3, background: "#111114" },
  })
    .composite(frames.map((input, i) => ({ input, left: gap + i * (THUMB_WIDTH + gap), top: gap })))
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function inspectVideo(s3Key: string): Promise<VideoInspection> {
  const dir = await mkdtemp(join(tmpdir(), "studio-reel-"));
  const file = join(dir, "reel.mp4");
  const empty: VideoFacts = {
    container: null,
    width: null,
    height: null,
    durationSec: null,
    fps: null,
    videoCodec: null,
    audioCodec: null,
    hasAudio: false,
    loudnessLufs: null,
    truePeakDb: null,
    frameHashes: [],
  };
  try {
    await downloadToFile(s3Key, file);
    let base;
    try {
      const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { timeout: TIMEOUT });
      base = parseProbe(stdout);
    } catch {
      return { facts: empty, contactSheet: null, error: "File tidak bisa dibaca sebagai video" };
    }

    let loud = { loudnessLufs: null as number | null, truePeakDb: null as number | null };
    if (base.hasAudio) {
      // ebur128 writes its report to stderr; the command itself produces no output file.
      const { stderr } = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], {
        timeout: TIMEOUT,
        maxBuffer: 20 * 1024 * 1024,
      });
      loud = parseLoudness(stderr);
    }

    let frames: Buffer[] = [];
    if (base.durationSec) {
      frames = await Promise.all(FRAME_AT.map((f) => frameAt(file, base.durationSec! * f)));
    }
    const frameHashes = await Promise.all(frames.map((f) => differenceHash(f)));
    return {
      facts: { ...base, ...loud, frameHashes },
      contactSheet: frames.length ? await contactSheet(frames) : null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Confirms ffmpeg/ffprobe are callable; used by the setup check. */
export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(FFPROBE, ["-version"], { timeout: 10_000 });
    await run(FFMPEG, ["-version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
