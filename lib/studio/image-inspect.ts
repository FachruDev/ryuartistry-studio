import sharp from "sharp";

const ZERO = BigInt(0);
const ONE = BigInt(1);

export type ImageFacts = {
  /** sharp format name, e.g. "jpeg", "png" */
  format: string | null;
  width: number | null;
  height: number | null;
  /** colour space, e.g. "srgb", "cmyk" */
  space: string | null;
  /** 64-bit difference hash as 16 hex chars, for near-duplicate detection */
  dhash: string | null;
};

/**
 * Reads the real properties of an image file instead of trusting what the agent declares.
 * Returns nulls (not a throw) for files sharp cannot decode, so the auto-check can report it.
 */
export async function inspectImage(bytes: Buffer): Promise<ImageFacts> {
  try {
    const meta = await sharp(bytes).metadata();
    return {
      format: meta.format ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      space: meta.space ?? null,
      dhash: await differenceHash(bytes),
    };
  } catch {
    return { format: null, width: null, height: null, space: null, dhash: null };
  }
}

/**
 * dHash: shrink to 9x8 grayscale and compare each pixel with its right neighbour.
 * Visually similar images (re-crops, recolours, small edits) end up a few bits apart.
 */
export async function differenceHash(bytes: Buffer): Promise<string> {
  const pixels = await sharp(bytes).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hash = ZERO;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      hash = (hash << ONE) | (left > right ? ONE : ZERO);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Number of differing bits between two dHashes (0 = identical, 64 = opposite). */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & ONE);
    x >>= ONE;
  }
  return count;
}
