import sharp from "sharp";

export interface MediaValidation {
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export async function validateSocialImage(
  bytes: Buffer,
  maxBytes = 8_000_000
): Promise<MediaValidation> {
  if (bytes.byteLength > maxBytes) {
    throw new Error("Social image exceeds the byte cap");
  }
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to read social image metadata");
  }
  if (metadata.width < 320 || metadata.height < 320) {
    throw new Error("Social image is too small");
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error(`Unsupported social image format: ${metadata.format}`);
  }
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: bytes.byteLength
  };
}
