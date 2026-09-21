import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  ITEM_IMAGE_MAX_DIMENSION,
  optimizeItemImage,
  optimizedItemImagePath,
} from "@/lib/images/optimize-item-image";

describe("optimizeItemImage", () => {
  it("converts and bounds a transparent PNG without changing its ratio", async () => {
    const source = await sharp({
      create: {
        width: 512,
        height: 128,
        channels: 4,
        background: { r: 180, g: 20, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const output = await optimizeItemImage(source);
    const metadata = await sharp(output.bytes).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(ITEM_IMAGE_MAX_DIMENSION);
    expect(metadata.height).toBe(64);
    expect(metadata.hasAlpha).toBe(true);
    expect(output.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not upscale a small source", async () => {
    const source = await sharp({
      create: {
        width: 64,
        height: 40,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const output = await optimizeItemImage(source);
    expect([output.width, output.height]).toEqual([64, 40]);
    expect(optimizedItemImagePath(output.digest)).toMatch(
      /^optimized\/[a-f0-9]{24}\.webp$/,
    );
  });

  it("rejects input larger than the upload limit before decoding", async () => {
    const tooLarge = new Uint8Array(2 * 1024 * 1024 + 1);
    await expect(optimizeItemImage(tooLarge)).rejects.toThrow(
      "larger than 2 MB",
    );
  });
});
