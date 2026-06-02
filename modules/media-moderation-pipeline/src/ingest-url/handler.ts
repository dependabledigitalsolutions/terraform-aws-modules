// Admin-only: ingest a single image/video URL from the public internet
// into the pending bucket, so it flows through the regular moderation
// pipeline. Used by the bulk-upload admin UI; one POST per URL keeps
// progress reporting simple and avoids Lambda timeouts on big batches.

import { ulid } from "ulid";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { verifyGoogleIdToken } from "../shared/jwt";
import { ddbHelpers } from "../shared/ddb";

const s3 = new S3Client({});

interface Event {
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface Body {
  url: string;
  mood?: string;
  caption?: string;
}

const ALLOWED = () => (process.env.ALLOWED_CONTENT_TYPES ?? "").split(",").filter(Boolean);
const MAX_IMG = () => Number(process.env.MAX_IMAGE_SIZE_BYTES ?? 10_485_760);
const MAX_VID = () => Number(process.env.MAX_VIDEO_SIZE_BYTES ?? 52_428_800);
const RATE_FALLBACK = () => Number(process.env.UPLOADS_PER_DAY_PER_USER ?? 5);
const ADMIN_RATE = () => Number(process.env.ADMIN_UPLOADS_PER_DAY_PER_USER ?? RATE_FALLBACK());
const ADMIN_EMAILS = () => new Set(
  (process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
);

const EXT_OF: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov"
};

function reply(statusCode: number, body: unknown) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function looksLikeHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function handler(event: Event) {
  let body: Body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  if (!body.url || !looksLikeHttpUrl(body.url)) {
    return reply(400, { error: "invalid_url" });
  }

  const auth = event.headers.authorization ?? event.headers.Authorization;
  if (!auth?.startsWith("Bearer ")) return reply(401, { error: "missing_bearer" });
  const token = auth.slice(7);

  let claims;
  try {
    claims = await verifyGoogleIdToken(token, process.env.GOOGLE_CLIENT_ID!);
  } catch {
    return reply(401, { error: "invalid_token" });
  }

  const admins = ADMIN_EMAILS();
  if (admins.size === 0 || !claims.email || !admins.has(claims.email.toLowerCase())) {
    return reply(403, { error: "not_admin" });
  }

  const ddb = ddbHelpers(process.env.TABLE_NAME!);
  if (await ddb.isBanned(claims.sub)) return reply(403, { error: "banned" });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (await ddb.countUserUploadsSince(claims.sub, since) >= ADMIN_RATE()) {
    return reply(429, { error: "rate_limited" });
  }

  // Server-side fetch — bypasses browser CORS. Follow redirects, but cap
  // the response size up-front via the content-length header.
  let resp: Response;
  try {
    resp = await fetch(body.url, { redirect: "follow" });
  } catch (err) {
    return reply(502, { error: "fetch_failed", message: (err as Error).message });
  }
  if (!resp.ok) {
    return reply(502, { error: "fetch_failed", upstream: resp.status });
  }

  const declaredType = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED().includes(declaredType)) {
    return reply(415, { error: "unsupported_content_type", got: declaredType });
  }

  const isVideo = declaredType.startsWith("video/");
  const cap = isVideo ? MAX_VID() : MAX_IMG();
  const declaredLength = Number(resp.headers.get("content-length") ?? 0);
  if (declaredLength > 0 && declaredLength > cap) {
    return reply(413, { error: "too_large", limit: cap, declared: declaredLength });
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength > cap) {
    return reply(413, { error: "too_large", limit: cap, actual: buf.byteLength });
  }

  const id = ulid();
  const ext = EXT_OF[declaredType] ?? "bin";
  const key = `pending/${id}/original.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.PENDING_BUCKET!,
    Key: key,
    Body: buf,
    ContentType: declaredType
  }));

  // Stash uploader metadata so finalize-upload (triggered by the S3 event)
  // can attach it to the moderation card. Matches sign-upload's pattern.
  await ddb.putStash({
    PK: `UPLOAD#${id}`,
    SK: "STASH",
    uploaderSub: claims.sub,
    uploaderName: claims.name,
    uploaderEmail: claims.email,
    mood: body.mood,
    caption: body.caption,
    ttl: Math.floor(Date.now() / 1000) + 60 * 60
  });

  return reply(200, { ulid: id, contentType: declaredType, bytes: buf.byteLength });
}
