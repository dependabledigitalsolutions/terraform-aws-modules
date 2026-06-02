import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
  isBanned: vi.fn(),
  countUserUploadsSince: vi.fn(),
  putStash: vi.fn(),
  s3Send: vi.fn()
}));

vi.mock("../shared/jwt", () => ({ verifyGoogleIdToken: mocks.verifyGoogleIdToken }));
vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({
    isBanned: mocks.isBanned,
    countUserUploadsSince: mocks.countUserUploadsSince,
    putStash: mocks.putStash
  })
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mocks.s3Send })),
  PutObjectCommand: vi.fn().mockImplementation(args => ({ args }))
}));

import { handler } from "./handler";

const env = {
  TABLE_NAME: "tbl",
  PENDING_BUCKET: "pending",
  PUBLIC_BUCKET: "public",
  GOOGLE_CLIENT_ID: "gc",
  ALLOWED_CONTENT_TYPES: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime",
  MAX_IMAGE_SIZE_BYTES: "10485760",
  MAX_VIDEO_SIZE_BYTES: "52428800",
  UPLOADS_PER_DAY_PER_USER: "5",
  ADMIN_UPLOADS_PER_DAY_PER_USER: "500",
  ADMIN_EMAILS: "admin@example.com,j@g.com"
};

function evt(body: object, token = "Bearer good.jwt") {
  return {
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function mockFetch(opts: { status?: number; contentType?: string; bytes?: Uint8Array }) {
  const status = opts.status ?? 200;
  const bytes = opts.bytes ?? new Uint8Array([0xff, 0xd8, 0xff]);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([
      ["content-type", opts.contentType ?? "image/jpeg"],
      ["content-length", String(bytes.byteLength)]
    ]) as unknown as Headers,
    arrayBuffer: async () => bytes.buffer
  }) as typeof fetch;
}

beforeEach(() => {
  Object.assign(process.env, env);
  Object.values(mocks).forEach(m => m.mockReset());
  mocks.verifyGoogleIdToken.mockResolvedValue({ sub: "sub1", email: "j@g.com", name: "Jane", email_verified: true });
  mocks.isBanned.mockResolvedValue(false);
  mocks.countUserUploadsSince.mockResolvedValue(0);
  mocks.s3Send.mockResolvedValue({});
});

describe("ingest-url handler", () => {
  it("happy path: PUTs to pending bucket and returns a ulid", async () => {
    mockFetch({ contentType: "image/jpeg" });
    const r = await handler(evt({ url: "https://example.com/photo.jpg", mood: "trophy" }));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.contentType).toBe("image/jpeg");
    expect(mocks.s3Send).toHaveBeenCalled();
    expect(mocks.putStash).toHaveBeenCalled();
  });

  it("400 when url is missing or not http(s)", async () => {
    const r1 = await handler(evt({ mood: "trophy" }));
    expect(r1.statusCode).toBe(400);
    const r2 = await handler(evt({ url: "ftp://example.com/x.jpg" }));
    expect(r2.statusCode).toBe(400);
  });

  it("401 when JWT verification fails", async () => {
    mocks.verifyGoogleIdToken.mockRejectedValueOnce(new Error("bad"));
    const r = await handler(evt({ url: "https://example.com/photo.jpg" }));
    expect(r.statusCode).toBe(401);
  });

  it("403 when caller is not an admin", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValueOnce({ sub: "sub2", email: "outsider@example.com", name: "Out", email_verified: true });
    const r = await handler(evt({ url: "https://example.com/photo.jpg" }));
    expect(r.statusCode).toBe(403);
    const body = JSON.parse(r.body);
    expect(body.error).toBe("not_admin");
  });

  it("415 when upstream content-type isn't allowed", async () => {
    mockFetch({ contentType: "application/pdf" });
    const r = await handler(evt({ url: "https://example.com/x.pdf" }));
    expect(r.statusCode).toBe(415);
  });

  it("413 when upstream content-length exceeds the image cap", async () => {
    mockFetch({
      contentType: "image/jpeg",
      bytes: new Uint8Array(11 * 1024 * 1024)
    });
    const r = await handler(evt({ url: "https://example.com/big.jpg" }));
    expect(r.statusCode).toBe(413);
  });

  it("429 when admin is over the daily cap", async () => {
    mocks.countUserUploadsSince.mockResolvedValueOnce(500);
    mockFetch({ contentType: "image/jpeg" });
    const r = await handler(evt({ url: "https://example.com/photo.jpg" }));
    expect(r.statusCode).toBe(429);
  });

  it("502 when the upstream fetch fails", async () => {
    mockFetch({ status: 404 });
    const r = await handler(evt({ url: "https://example.com/missing.jpg" }));
    expect(r.statusCode).toBe(502);
  });
});
