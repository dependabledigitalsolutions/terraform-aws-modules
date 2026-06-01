// @ts-expect-error sharp comes from a Lambda layer at runtime
import sharp from "sharp";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { s3Helpers as S3HelpersFactory } from "../shared/s3";

const raw = new S3Client({});

export async function processImage(input: {
  s3: ReturnType<typeof S3HelpersFactory>;
  pending: string;
  ulid: string;
  ext: string;
  detected: string;
}): Promise<{ thumbKey: string; variants: { w400: string; w800: string; w1600: string } }> {
  const head = await input.s3.fetchHead(`pending/${input.ulid}/original.${input.ext}`, 25_000_000);
  const pipeline = sharp(head, { limitInputPixels: 25_000_000, failOnError: true });

  const variants = {
    w400:  `pending/${input.ulid}/w400.webp`,
    w800:  `pending/${input.ulid}/w800.webp`,
    w1600: `pending/${input.ulid}/w1600.webp`
  };
  const thumbKey = `pending/${input.ulid}/thumb.webp`;

  const ops: Array<[string, number]> = [
    [thumbKey, 320],
    [variants.w400, 400],
    [variants.w800, 800],
    [variants.w1600, 1600]
  ];
  for (const [key, width] of ops) {
    const body = await pipeline.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    await raw.send(new PutObjectCommand({ Bucket: input.pending, Key: key, Body: body, ContentType: "image/webp" }));
  }
  return { thumbKey, variants };
}
