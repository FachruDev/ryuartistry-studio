import { describe, expect, test } from "bun:test";
import { assetFileName, normalizeHashtags, validateReelMetadata, validateStoryboard } from "./reels";

const scene = (d: number, over = {}) => ({ duration_sec: d, visual: "Close-up tangan menulis", narration: "Tahukah kamu…", ...over });

describe("validateStoryboard", () => {
  test("accepts a 30-60 second storyboard with a hook", () => {
    expect(validateStoryboard({ hook: "Fakta yang bikin kaget dalam 3 detik", scenes: [scene(3), scene(20), scene(17)] })).toEqual({
      totalSec: 40,
      problems: [],
    });
  });

  test("lists every problem", () => {
    const { problems } = validateStoryboard({ hook: "", scenes: [scene(8, { visual: "" }), scene(4, { narration: "" })] });
    expect(problems.join("|")).toContain("hook");
    expect(problems.join("|")).toContain("scene 1: visual");
    expect(problems.join("|")).toContain("scene 2: isi narration");
    expect(problems.join("|")).toContain("total durasi 12");
    expect(problems.join("|")).toContain("scene pertama");
  });
});

describe("reel metadata", () => {
  test("normalises hashtags", () => {
    expect(normalizeHashtags(["sains", "#Sains", "##fakta unik", " "])).toEqual(["#sains", "#faktaunik"]);
  });

  test("requires a caption and caps hashtags", () => {
    expect(() => validateReelMetadata({ title: "Fakta", caption: "", hashtags: [] })).toThrow(/Caption wajib/);
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(() => validateReelMetadata({ title: "Fakta", caption: "Ok", hashtags: tags })).toThrow(/maksimal 10/);
  });

  test("assetFileName fits the length budget", () => {
    const n = assetFileName("Fakta unik tentang gurita yang jarang diketahui orang", "9f2c1d3e-aaaa", "mp4");
    expect(n.length).toBeLessThanOrEqual(40);
    expect(n).toMatch(/-9f2c1d3e\.mp4$/);
  });
});
