import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});

export interface S3Config {
  pendingBucket: string;
  publicBucket: string;
}

export function s3Helpers(cfg: S3Config) {
  return {
    async signUpload(input: {
      ulid: string;
      contentType: string;
      contentLengthMax: number;
      extension: string;
    }): Promise<string> {
      const key = `pending/${input.ulid}/original.${input.extension}`;
      const cmd = new PutObjectCommand({
        Bucket: cfg.pendingBucket,
        Key: key,
        ContentType: input.contentType
      });
      return getSignedUrl(s3, cmd, { expiresIn: 300 });
    },

    async fetchHead(key: string, byteCount: number): Promise<Buffer> {
      const r = await s3.send(new GetObjectCommand({
        Bucket: cfg.pendingBucket,
        Key: key,
        Range: `bytes=0-${byteCount - 1}`
      }));
      const chunks: Buffer[] = [];
      for await (const chunk of r.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },

    async copyToPublic(ulid: string): Promise<{ copiedKeys: string[] }> {
      const list = await s3.send(new ListObjectsV2Command({
        Bucket: cfg.pendingBucket,
        Prefix: `pending/${ulid}/`
      }));
      const sourceKeys = (list.Contents ?? []).map(o => o.Key!).filter(Boolean);
      const copiedKeys: string[] = [];
      for (const src of sourceKeys) {
        const tail = src.replace(/^pending\//, "");
        const dst = `public/${tail}`;
        await s3.send(new CopyObjectCommand({
          Bucket: cfg.publicBucket,
          Key: dst,
          CopySource: encodeURIComponent(`${cfg.pendingBucket}/${src}`)
        }));
        copiedKeys.push(dst);
      }
      await this.deletePending(ulid);
      return { copiedKeys };
    },

    async deletePending(ulid: string): Promise<void> {
      const list = await s3.send(new ListObjectsV2Command({
        Bucket: cfg.pendingBucket,
        Prefix: `pending/${ulid}/`
      }));
      const keys = (list.Contents ?? []).map(o => o.Key!).filter(Boolean);
      if (keys.length === 0) return;
      await s3.send(new DeleteObjectsCommand({
        Bucket: cfg.pendingBucket,
        Delete: { Objects: keys.map(Key => ({ Key })) }
      }));
    }
  };
}
