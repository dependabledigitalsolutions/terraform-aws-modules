import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionStatus: vi.fn(),
  historyForUploader: vi.fn(),
  smSend: vi.fn(),
  fetchMock: vi.fn(),
  getSignedUrl: vi.fn()
}));

vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({
    transitionStatus: mocks.transitionStatus,
    historyForUploader: mocks.historyForUploader
  })
}));
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.smSend })),
  GetSecretValueCommand: vi.fn(input => ({ name: "GetSecret", input }))
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.getSignedUrl }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  GetObjectCommand: vi.fn(input => ({ name: "Get", input }))
}));

import { handler } from "./handler";

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  vi.stubGlobal("fetch", mocks.fetchMock);
  mocks.fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) });
  mocks.smSend.mockResolvedValue({ SecretString: JSON.stringify({ slack_bot_token: "xoxb" }) });
  mocks.getSignedUrl.mockResolvedValue("https://signed.example/url");
  Object.assign(process.env, {
    TABLE_NAME: "tbl",
    SLACK_CHANNEL_ID: "C0X",
    SLACK_BOT_TOKEN_ARN: "arn:secret",
    PENDING_BUCKET: "pending-bucket",
    MAX_VIDEO_DURATION_SECS: "30"
  });
});

function mcEvent(status: "COMPLETE" | "ERROR", durationMs?: number) {
  return {
    detail: {
      status,
      jobId: "job-1",
      userMetadata: { ulid: "01VID", sk: "2026-01-01T00:00:00Z#01VID" },
      outputGroupDetails: durationMs !== undefined
        ? [{ outputDetails: [{ durationInMs: durationMs, videoDetails: { widthInPx: 1280, heightInPx: 720 } }] }]
        : undefined
    }
  };
}

describe("transcode-complete handler", () => {
  it("ERROR → status=rejected + slack error", async () => {
    mocks.transitionStatus.mockResolvedValueOnce({ uploaderSub: "x", uploaderName: "n", uploaderEmail: "e@g.com" });
    await handler(mcEvent("ERROR"));
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      expect.any(String),
      "transcoding",
      "rejected",
      expect.objectContaining({ moderation: expect.objectContaining({ decision: "rejected" }) })
    );
    expect(mocks.fetchMock).toHaveBeenCalled();
  });

  it("COMPLETE within duration → status=pending + slack card", async () => {
    mocks.transitionStatus.mockResolvedValueOnce({
      uploaderSub: "sub1", uploaderName: "Sam", uploaderEmail: "s@g.com", mood: "goals", caption: undefined
    });
    mocks.historyForUploader.mockResolvedValueOnce({ approved: 0, rejected: 0, expired: 0 });
    await handler(mcEvent("COMPLETE", 5000));
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      expect.any(String),
      "transcoding",
      "pending",
      expect.objectContaining({ duration: 5 })
    );
    expect(mocks.fetchMock).toHaveBeenCalled();
  });

  it("COMPLETE exceeding duration → status=rejected + slack message (no card)", async () => {
    mocks.transitionStatus.mockResolvedValueOnce({ uploaderSub: "x", uploaderName: "n", uploaderEmail: "e@g.com" });
    await handler(mcEvent("COMPLETE", 999_000));
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      expect.any(String),
      "transcoding",
      "rejected",
      expect.anything()
    );
    const slackBody = JSON.parse(mocks.fetchMock.mock.calls[0][1].body);
    expect(slackBody.text).toMatch(/exceeds/);
  });

  it("missing userMetadata → no-op", async () => {
    await handler({ detail: { status: "COMPLETE", jobId: "x" } });
    expect(mocks.transitionStatus).not.toHaveBeenCalled();
  });
});
