import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
  isBanned: vi.fn(),
  countUserUploadsSince: vi.fn(),
  putStash: vi.fn(),
  signUpload: vi.fn()
}));

vi.mock("../shared/jwt", () => ({ verifyGoogleIdToken: mocks.verifyGoogleIdToken }));
vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({
    isBanned: mocks.isBanned,
    countUserUploadsSince: mocks.countUserUploadsSince,
    putStash: mocks.putStash
  })
}));
vi.mock("../shared/s3", () => ({
  s3Helpers: () => ({ signUpload: mocks.signUpload })
}));

import { handler } from "./handler";

const env = {
  TABLE_NAME: "tbl", PENDING_BUCKET: "pending", PUBLIC_BUCKET: "public",
  GOOGLE_CLIENT_ID: "gc",
  ALLOWED_CONTENT_TYPES: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime",
  MAX_IMAGE_SIZE_BYTES: "10485760",
  MAX_VIDEO_SIZE_BYTES: "52428800",
  UPLOADS_PER_DAY_PER_USER: "5"
};

function evt(body: object, token = "Bearer good.jwt") {
  return {
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

beforeEach(() => {
  Object.assign(process.env, env);
  Object.values(mocks).forEach(m => m.mockReset());
  mocks.verifyGoogleIdToken.mockResolvedValue({ sub: "sub1", email: "j@g.com", name: "Jane", email_verified: true });
  mocks.isBanned.mockResolvedValue(false);
  mocks.countUserUploadsSince.mockResolvedValue(0);
  mocks.signUpload.mockResolvedValue("https://signed/url");
});

describe("sign-upload handler", () => {
  it("returns 200 with a presigned URL on the happy path", async () => {
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 1024, mood: "trophy", caption: "a" }));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.uploadUrl).toBe("https://signed/url");
    expect(body.ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(mocks.putStash).toHaveBeenCalled();
  });

  it("returns 401 when JWT verification fails", async () => {
    mocks.verifyGoogleIdToken.mockRejectedValueOnce(new Error("bad"));
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(401);
  });

  it("returns 403 when banned", async () => {
    mocks.isBanned.mockResolvedValueOnce(true);
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(403);
  });

  it("returns 429 when over rate limit", async () => {
    mocks.countUserUploadsSince.mockResolvedValueOnce(99);
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(429);
  });

  it("returns 415 when content type not allowed", async () => {
    const r = await handler(evt({ filename: "x.exe", contentType: "application/x-msdownload", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(415);
  });

  it("returns 413 when image content length exceeds image cap", async () => {
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 100 * 1024 * 1024, mood: "trophy" }));
    expect(r.statusCode).toBe(413);
  });

  it("admin email gets the admin rate limit", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com,j@g.com";
    process.env.ADMIN_UPLOADS_PER_DAY_PER_USER = "50";
    // Just under admin cap, above regular cap (5).
    mocks.countUserUploadsSince.mockResolvedValueOnce(20);
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(200);
  });

  it("admin email still hits 429 above the admin cap", async () => {
    process.env.ADMIN_EMAILS = "j@g.com";
    process.env.ADMIN_UPLOADS_PER_DAY_PER_USER = "10";
    mocks.countUserUploadsSince.mockResolvedValueOnce(10);
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(429);
  });

  it("non-admin email obeys the regular cap even when ADMIN_EMAILS set", async () => {
    process.env.ADMIN_EMAILS = "someone-else@example.com";
    process.env.ADMIN_UPLOADS_PER_DAY_PER_USER = "999";
    mocks.countUserUploadsSince.mockResolvedValueOnce(5);
    const r = await handler(evt({ filename: "x.jpg", contentType: "image/jpeg", contentLength: 10, mood: "trophy" }));
    expect(r.statusCode).toBe(429);
  });
});
