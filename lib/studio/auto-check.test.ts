import { expect, test } from "bun:test";
import { runAutoCheck } from "./auto-check";
import type { VideoFacts } from "./video-probe";

const good: VideoFacts = {
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  width: 1080,
  height: 1920,
  durationSec: 42,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  loudnessLufs: -14,
  truePeakDb: -1.5,
  frameHashes: [],
};
const reel = (v: Partial<VideoFacts>, extra = {}) =>
  runAutoCheck("facebook_reels", { contentType: "video/mp4", bytes: 1000, width: null, height: null, durationSec: null, video: { ...good, ...v }, ...extra });

test("a well-formed reel passes", () => {
  expect(reel({})).toEqual({ passed: true, problems: [] });
});

test("rejects landscape, short, silent and clipping reels with specific reasons", () => {
  expect(reel({ width: 1920, height: 1080 }).problems[0]).toContain("9:16");
  expect(reel({ width: 720, height: 1280 }).problems[0]).toContain("minimal 1080");
  expect(reel({ durationSec: 12 }).problems[0]).toContain("30-60");
  expect(reel({ hasAudio: false, audioCodec: null }).problems[0]).toContain("Tidak ada audio");
  expect(reel({ loudnessLufs: -30 }).problems[0]).toContain("terlalu pelan");
  expect(reel({ truePeakDb: 0.2 }).problems[0]).toContain("clipping");
  expect(reel({ videoCodec: "hevc" }).problems[0]).toContain("H.264");
});

test("flags near-duplicate reels and unreadable files", () => {
  expect(reel({}, { nearestDuplicate: { assetId: "abcdef123", distance: 2 } }).problems[0]).toContain("tidak orisinal");
  expect(reel({}, { inspectError: "File tidak bisa dibaca sebagai video" }).passed).toBe(false);
});
