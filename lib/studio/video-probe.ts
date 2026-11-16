/**
 * Pure parsers for ffprobe / ffmpeg output, kept free of I/O so they can be unit-tested.
 * The process calls live in video-inspect.ts.
 */

export type VideoFacts = {
  container: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  /** Integrated loudness, LUFS (EBU R128). */
  loudnessLufs: number | null;
  /** True peak, dBTP. Above about -1 means the audio is likely to clip after encoding. */
  truePeakDb: number | null;
  /** One dHash per sampled frame (16 hex chars each). */
  frameHashes: string[];
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
};

function rate(s: string | undefined): number | null {
  if (!s) return null;
  const [n, d] = s.split("/").map(Number);
  if (!n || !d) return null;
  return Math.round((n / d) * 100) / 100;
}

/** Parses `ffprobe -print_format json -show_streams -show_format`. Rotation swaps width/height. */
export function parseProbe(json: string): Omit<VideoFacts, "loudnessLufs" | "truePeakDb" | "frameHashes"> {
  const data = JSON.parse(json) as { streams?: ProbeStream[]; format?: { format_name?: string; duration?: string } };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  let width = video?.width ?? null;
  let height = video?.height ?? null;
  const rotation = Math.abs(video?.side_data_list?.find((x) => x.rotation != null)?.rotation ?? Number(video?.tags?.rotate ?? 0));
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  const duration = Number(data.format?.duration);
  return {
    container: data.format?.format_name ?? null,
    width,
    height,
    durationSec: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
    fps: rate(video?.avg_frame_rate) ?? rate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
  };
}

/** Reads the summary block that ffmpeg's ebur128 filter prints to stderr. */
export function parseLoudness(stderr: string): { loudnessLufs: number | null; truePeakDb: number | null } {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const i = summary.match(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  const p = summary.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  const num = (m: RegExpMatchArray | null) => (m && m[1] !== "-inf" ? Number(m[1]) : null);
  return { loudnessLufs: num(i), truePeakDb: num(p) };
}

/** Average dHash distance between corresponding frames (0 = identical video). */
export function videoDistance(a: string[], b: string[], hamming: (x: string, y: string) => number): number | null {
  const n = Math.min(a.length, b.length);
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += hamming(a[i], b[i]);
  return Math.round((sum / n) * 10) / 10;
}
