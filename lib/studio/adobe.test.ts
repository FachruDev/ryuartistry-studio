import { describe, expect, test } from "bun:test";
import { adobeFileName, buildAdobeCsv, normalizeKeywords, validateAdobeMetadata } from "./adobe";
import { hammingDistance } from "./image-inspect";

const kw = ["paper", "texture", "overlay", "folded", "background"];

describe("validateAdobeMetadata", () => {
  test("accepts valid metadata and normalises keywords", () => {
    const m = validateAdobeMetadata({ title: "  Folded  paper texture ", keywords: [...kw, " Paper "], category: "8" });
    expect(m).toEqual({ title: "Folded paper texture", keywords: kw, category: 8 });
  });

  test("lists every problem at once", () => {
    const err = (() => {
      try {
        validateAdobeMetadata({ title: `${"x".repeat(71)}, more`, keywords: ["a"], category: 99 });
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toContain("maksimal 70");
    expect(err).toContain("koma");
    expect(err).toContain("minimal 5");
    expect(err).toContain("Kategori");
  });

  test("rejects AI tool names in title or keywords", () => {
    expect(() => validateAdobeMetadata({ title: "Paper texture", keywords: [...kw, "midjourney"], category: 8 })).toThrow(
      /midjourney/,
    );
  });

  test("rejects more than 49 keywords", () => {
    const many = Array.from({ length: 50 }, (_, i) => `k${i}`);
    expect(() => validateAdobeMetadata({ title: "Paper", keywords: many, category: 8 })).toThrow(/maksimal 49/);
  });
});

describe("adobeFileName", () => {
  test("is at most 30 characters and ends with .jpg", () => {
    const name = adobeFileName("A very long descriptive title about folded paper textures", "1e336d67-aaaa-bbbb");
    expect(name.length).toBeLessThanOrEqual(30);
    expect(name).toMatch(/^[a-z0-9-]+-1e336d67\.jpg$/);
  });
});

describe("buildAdobeCsv", () => {
  test("uses Adobe headers and quotes the keyword list", () => {
    const csv = buildAdobeCsv([{ fileName: "a.jpg", title: "Paper", keywords: ["a", "b"], category: 8 }]);
    expect(csv).toBe('Filename,Title,Keywords,Category,Releases\r\na.jpg,Paper,"a, b",8,\r\n');
  });
});

test("normalizeKeywords drops empties and duplicates", () => {
  expect(normalizeKeywords(["A", "a ", "", "b  c"])).toEqual(["a", "b c"]);
});

test("hammingDistance", () => {
  expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
  expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
  expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
});
