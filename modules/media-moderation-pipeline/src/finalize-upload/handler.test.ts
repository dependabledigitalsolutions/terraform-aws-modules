import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  takeStash: vi.fn(),
  putContent: vi.fn(),
  historyForUploader: vi.fn(),
  fetchHead: vi.fn(),
  deletePending: vi.fn(),
  detectMime: vi.fn(),
  processImage: vi.fn(),
  mcSend: vi.fn(),
  smSend: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({
    takeStash: mocks.takeStash,
    putContent: mocks.putContent,
    historyForUploader: mocks.historyForUploader
  })
}));
vi.mock("../shared/s3", () => ({
  s3Helpers: () => ({
    fetchHead: mocks.fetchHead,
    deletePending: mocks.deletePending
  })
}));
vi.mock("../shared/magic-bytes", () => ({ detectMime: mocks.detectMime }));
vi.mock("./image-pipeline", () => ({ processImage: mocks.processImage }));
vi.mock("@aws-sdk/client-mediaconvert", () => ({
  MediaConvertClient: vi.fn(() => ({ send: mocks.mcSend })),
  CreateJobCommand: vi.fn(input => ({ name: "CreateJob", input }))
}));
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.smSend })),
  GetSecretValueCommand: vi.fn(input => ({ name: "GetSecret", input }))
}));

import { handler } from "./handler";

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  // global fetch stub for Slack
  vi.stubGlobal("fetch", mocks.fetchMock);
  mocks.fetchMock.mockResolvedValue({
    json: async () => ({ ok: true, ts: "1234.5678" })
  });
  mocks.smSend.mockResolvedValue({ SecretString: JSON.stringify({ slack_bot_token: "xoxb-fake" }) });
  mocks.historyForUploader.mockResolvedValue({ approved: 1, rejected: 0, expired: 0 });
  Object.assign(process.env, {
    TABLE_NAME: "tbl",
    PENDING_BUCKET: "pending",
    PUBLIC_BUCKET: "public",
    SLACK_CHANNEL_ID: "C0X",
    SLACK_BOT_TOKEN_ARN: "arn:secret:bot",
    MEDIACONVERT_ROLE_ARN: "arn:mc:role",
    MEDIACONVERT_JOB_TEMPLATE: "tpl",
    CLOUDFRONT_DOMAIN: "cdn.example"
  });
});

function s3Event(key: string) {
  return { Records: [{ s3: { object: { key } } }] };
}

describe("finalize-upload handler", () => {
  it("image path: writes row + processes + posts Slack", async () => {
    mocks.takeStash.mockResolvedValueOnce({
      uploaderSub: "sub1", uploaderName: "Jane", uploaderEmail: "j@g.com", mood: "trophy", caption: "x"
    });
    mocks.fetchHead.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    mocks.detectMime.mockReturnValueOnce("image/jpeg");
    mocks.processImage.mockResolvedValueOnce({
      thumbKey: "pending/01HX/thumb.webp",
      variants: { w400: "p", w800: "p", w1600: "p" }
    });

    await handler(s3Event("pending/01HX/original.jpg"));

    expect(mocks.putContent).toHaveBeenCalled();
    const row = mocks.putContent.mock.calls[0][0];
    expect(row.type).toBe("image");
    expect(row.status).toBe("pending");
    expect(mocks.processImage).toHaveBeenCalled();
    expect(mocks.mcSend).not.toHaveBeenCalled();
    expect(mocks.fetchMock).toHaveBeenCalled(); // slack post
  });

  it("video path: writes row with status=transcoding + starts MediaConvert + NO slack post", async () => {
    mocks.takeStash.mockResolvedValueOnce({
      uploaderSub: "sub1", uploaderName: "Sam", uploaderEmail: "s@g.com", mood: "goals", caption: undefined
    });
    mocks.fetchHead.mockResolvedValueOnce(Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]));
    mocks.detectMime.mockReturnValueOnce("video/mp4");

    await handler(s3Event("pending/01VID/original.mp4"));

    const row = mocks.putContent.mock.calls[0][0];
    expect(row.type).toBe("video");
    expect(row.status).toBe("transcoding");
    expect(mocks.mcSend).toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("missing stash → delete pending and skip", async () => {
    mocks.takeStash.mockResolvedValueOnce(undefined);

    await handler(s3Event("pending/01OLD/original.jpg"));

    expect(mocks.deletePending).toHaveBeenCalledWith("01OLD");
    expect(mocks.putContent).not.toHaveBeenCalled();
  });

  it("magic-byte mismatch → delete pending and skip", async () => {
    mocks.takeStash.mockResolvedValueOnce({
      uploaderSub: "sub1", uploaderName: "n", uploaderEmail: "e@g.com"
    });
    mocks.fetchHead.mockResolvedValueOnce(Buffer.from([0,0,0,0]));
    mocks.detectMime.mockReturnValueOnce(null);

    await handler(s3Event("pending/01BAD/original.jpg"));

    expect(mocks.deletePending).toHaveBeenCalledWith("01BAD");
    expect(mocks.putContent).not.toHaveBeenCalled();
  });

  it("ignores keys that don't match pending/<id>/original.<ext>", async () => {
    await handler(s3Event("pending/01X/thumb.webp"));
    expect(mocks.takeStash).not.toHaveBeenCalled();
  });
});
