import { expect, test } from "bun:test";
import { hammingDistance } from "./image-inspect";
import { parseLoudness, parseProbe, videoDistance } from "./video-probe";

const probe = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30000/1001", ...over },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "42.531000" },
  });

test("parseProbe reads size, duration, fps and codecs", () => {
  expect(parseProbe(probe())).toEqual({
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    width: 1080,
    height: 1920,
    durationSec: 42.53,
    fps: 29.97,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
  });
});

test("parseProbe swaps width/height for rotated phone footage", () => {
  const r = parseProbe(probe({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }));
  expect([r.width, r.height]).toEqual([1080, 1920]);
});

test("parseProbe reports a missing audio stream", () => {
  const silent = JSON.stringify({ streams: [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920 }], format: {} });
  expect(parseProbe(silent)).toMatchObject({ hasAudio: false, audioCodec: null, durationSec: null });
});

test("parseLoudness reads the final summary, not per-frame lines", () => {
  const stderr = `[Parsed_ebur128_0 @ x] t: 1 TARGET:-23 LUFS M: -20.0 S: -20.0 I: -30.0 LUFS
[Parsed_ebur128_0 @ x] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.3 LUFS

  True peak:
    Peak:       -0.4 dBFS`;
  expect(parseLoudness(stderr)).toEqual({ loudnessLufs: -14.2, truePeakDb: -0.4 });
  expect(parseLoudness("Summary:\n I: -inf LUFS\n Peak: -inf dBFS")).toEqual({ loudnessLufs: null, truePeakDb: null });
});

test("videoDistance averages frame distances", () => {
  expect(videoDistance(["0000000000000000", "000000000000000f"], ["0000000000000000", "0000000000000000"], hammingDistance)).toBe(2);
  expect(videoDistance([], ["0000000000000000"], hammingDistance)).toBeNull();
});
