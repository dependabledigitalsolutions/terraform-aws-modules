import { ulid } from "ulid";
import { verifyGoogleIdToken } from "../shared/jwt";
import { ddbHelpers } from "../shared/ddb";
import { s3Helpers } from "../shared/s3";

interface Event {
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface Body {
  filename: string;
  contentType: string;
  contentLength: number;
  mood?: string;
  caption?: string;
}

const ALLOWED = () => (process.env.ALLOWED_CONTENT_TYPES ?? "").split(",").filter(Boolean);
const MAX_IMG = () => Number(process.env.MAX_IMAGE_SIZE_BYTES ?? 10_485_760);
const MAX_VID = () => Number(process.env.MAX_VIDEO_SIZE_BYTES ?? 52_428_800);
const RATE   = () => Number(process.env.UPLOADS_PER_DAY_PER_USER ?? 5);
const ADMIN_RATE = () => Number(process.env.ADMIN_UPLOADS_PER_DAY_PER_USER ?? RATE());
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

export async function handler(event: Event) {
  let body: Body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return reply(400, { error: "invalid_json" });
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

  if (!ALLOWED().includes(body.contentType)) {
    return reply(415, { error: "unsupported_content_type" });
  }
  const isVideo = body.contentType.startsWith("video/");
  const cap = isVideo ? MAX_VID() : MAX_IMG();
  if (body.contentLength > cap) {
    return reply(413, { error: "too_large", limit: cap });
  }

  const ddb = ddbHelpers(process.env.TABLE_NAME!);
  if (await ddb.isBanned(claims.sub)) return reply(403, { error: "banned" });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const isAdmin = !!claims.email && ADMIN_EMAILS().has(claims.email.toLowerCase());
  const effectiveRate = isAdmin ? ADMIN_RATE() : RATE();
  if (await ddb.countUserUploadsSince(claims.sub, since) >= effectiveRate) {
    return reply(429, { error: "rate_limited" });
  }

  const id = ulid();
  const ext = EXT_OF[body.contentType] ?? "bin";
  const s3 = s3Helpers({ pendingBucket: process.env.PENDING_BUCKET!, publicBucket: process.env.PUBLIC_BUCKET! });
  const uploadUrl = await s3.signUpload({ ulid: id, contentType: body.contentType, contentLengthMax: cap, extension: ext });

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

  return reply(200, { ulid: id, uploadUrl });
}
