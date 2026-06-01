import { describe, it, expect, vi, beforeEach } from "vitest";

const { send, presign } = vi.hoisted(() => ({ send: vi.fn(), presign: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send })),
  CopyObjectCommand: vi.fn(input => ({ name: "Copy", input })),
  DeleteObjectsCommand: vi.fn(input => ({ name: "DeleteMany", input })),
  ListObjectsV2Command: vi.fn(input => ({ name: "List", input })),
  GetObjectCommand: vi.fn(input => ({ name: "Get", input })),
  PutObjectCommand: vi.fn(input => ({ name: "Put", input }))
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: presign
}));

import { s3Helpers } from "./s3";

describe("s3Helpers", () => {
  beforeEach(() => { send.mockReset(); presign.mockReset(); });

  it("signs an upload URL bound to a key and content-type", async () => {
    presign.mockResolvedValueOnce("https://signed.example/upload");
    const h = s3Helpers({ pendingBucket: "pending", publicBucket: "public" });
    const url = await h.signUpload({
      ulid: "01HX",
      contentType: "image/jpeg",
      contentLengthMax: 100,
      extension: "jpg"
    });
    expect(url).toBe("https://signed.example/upload");
    expect(presign).toHaveBeenCalled();
  });

  it("copyToPublic copies every key under pending/<ulid>/ to public/<ulid>/", async () => {
    send.mockResolvedValueOnce({ Contents: [{ Key: "pending/01HX/original.jpg" }, { Key: "pending/01HX/thumb.webp" }] });
    send.mockResolvedValue({}); // copies + final list + deletes
    const h = s3Helpers({ pendingBucket: "pending", publicBucket: "public" });
    const copied = await h.copyToPublic("01HX");
    expect(copied.copiedKeys).toEqual(["public/01HX/original.jpg", "public/01HX/thumb.webp"]);
  });
});
