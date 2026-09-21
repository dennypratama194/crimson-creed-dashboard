import { createHash } from "node:crypto";

import sharp from "sharp";

export const ITEM_IMAGE_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const ITEM_IMAGE_MAX_DIMENSION = 256;
export const ITEM_IMAGE_CACHE_SECONDS = "31536000";
export const ITEM_IMAGE_ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const MAX_INPUT_PIXELS = 4096 * 4096;

export type OptimizedItemImage = {
  bytes: Buffer;
  digest: string;
  width: number;
  height: number;
};

/**
 * Produce the single immutable catalogue asset used at every UI size.
 *
 * This module is Node-only. Call it from Server Actions and maintenance
 * scripts, never from a Client Component.
 */
export async function optimizeItemImage(
  input: ArrayBuffer | Uint8Array,
): Promise<OptimizedItemImage> {
  const source = Buffer.from(
    input instanceof ArrayBuffer ? new Uint8Array(input) : input,
  );
  if (source.byteLength === 0) throw new Error("The image is empty.");
  if (source.byteLength > ITEM_IMAGE_MAX_INPUT_BYTES) {
    throw new Error("The image is larger than 2 MB.");
  }

  const { data, info } = await sharp(source, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width: ITEM_IMAGE_MAX_DIMENSION,
      height: ITEM_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: data,
    digest: createHash("sha256").update(data).digest("hex"),
    width: info.width,
    height: info.height,
  };
}

export function optimizedItemImagePath(digest: string): string {
  return `optimized/${digest.slice(0, 24)}.webp`;
}
