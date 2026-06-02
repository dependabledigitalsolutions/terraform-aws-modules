import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  getContentById: vi.fn(),
  transitionStatus: vi.fn(),
  copyToPublic: vi.fn(),
  deletePending: vi.fn(),
  smSend: vi.fn(),
  sqsSend: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({
    getContentById: mocks.getContentById,
    transitionStatus: mocks.transitionStatus
  })
}));
vi.mock("../shared/s3", () => ({
  s3Helpers: () => ({
    copyToPublic: mocks.copyToPublic,
    deletePending: mocks.deletePending
  })
}));
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.smSend })),
  GetSecretValueCommand: vi.fn(input => ({ name: "GetSecret", input }))
}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mocks.sqsSend })),
  SendMessageCommand: vi.fn(input => ({ name: "Send", input }))
}));

import { handler, __test } from "./handler";

const SIGNING_SECRET = "test_signing_secret_value";

function makeEvent(payload: object, sigOverride?: string): Parameters<typeof handler>[0] {
  const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const base = `v0:${ts}:${body}`;
  const sig = sigOverride ?? `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
  return {
    headers: {
      "x-slack-request-timestamp": ts,
      "x-slack-signature": sig
    },
    body
  };
}

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  vi.stubGlobal("fetch", mocks.fetchMock);
  mocks.fetchMock.mockResolvedValue({ json: async () => ({ ok: true, messages: [{ text: "original", bot_id: "B1" }] }) });
  mocks.smSend
    .mockImplementation(async (cmd: { input: { SecretId: string } }) => {
      if (cmd.input.SecretId.includes("signing")) {
        return { SecretString: JSON.stringify({ slack_signing_secret: SIGNING_SECRET }) };
      }
      return { SecretString: JSON.stringify({ slack_bot_token: "xoxb-fake" }) };
    });
  Object.assign(process.env, {
    TABLE_NAME: "tbl",
    PENDING_BUCKET: "pending",
    PUBLIC_BUCKET: "public",
    REBUILD_QUEUE_URL: "https://sqs/queue",
    SLACK_SIGNING_SECRET_ARN: "arn:secret:signing",
    SLACK_BOT_TOKEN_ARN: "arn:secret:bot",
    SLACK_REPLIES_RETRY_DELAY_MS: "0"
  });
});

describe("slack-interaction handler", () => {
  it("returns 400 when slack headers are missing", async () => {
    const r = await handler({ headers: {}, body: "" });
    expect(r.statusCode).toBe(400);
  });

  it("returns 401 when signature does not verify", async () => {
    const evt = makeEvent({ actions: [{ action_id: "approve_01HX", value: "01HX" }] }, "v0=deadbeef");
    const r = await handler(evt);
    expect(r.statusCode).toBe(401);
  });

  it("returns 200 immediately on valid signature", async () => {
    const payload = {
      actions: [{ action_id: "approve_01HX", value: "01HX" }],
      user: { name: "Emmanuel", profile: { email: "emmanuel@dds.com" } },
      message: { ts: "1234.5" },
      channel: { id: "C0X" }
    };
    const evt = makeEvent(payload);
    const r = await handler(evt);
    expect(r.statusCode).toBe(200);
  });
});

describe("processAction", () => {
  const payloadFor = (decision: "approve" | "reject"): Parameters<typeof __test.processAction>[0] => ({
    actions: [{ action_id: `${decision}_01HX`, value: "01HX" }],
    user: { name: "Emmanuel", profile: { email: "emmanuel@dds.com" } },
    message: { ts: "1234.5" },
    channel: { id: "C0X" }
  });

  it("approve: copies, transitions, enqueues rebuild, updates slack", async () => {
    mocks.getContentById.mockResolvedValueOnce({
      SK: "2026#01HX",
      id: "01HX",
      originalKey: "pending/01HX/original.jpg",
      thumbKey: "pending/01HX/thumb.webp"
    });
    mocks.copyToPublic.mockResolvedValueOnce({ copiedKeys: ["public/01HX/original.jpg", "public/01HX/thumb.webp"] });

    await __test.processAction(payloadFor("approve"), "xoxb", "tbl", "pending", "public", "https://sqs/queue");

    expect(mocks.copyToPublic).toHaveBeenCalledWith("01HX");
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      "2026#01HX",
      "pending",
      "approved",
      expect.objectContaining({
        publicKey: "public/01HX/original.jpg",
        thumbKey: "public/01HX/thumb.webp",
        moderation: expect.objectContaining({ decision: "approved", actor: "emmanuel@dds.com" })
      })
    );
    expect(mocks.sqsSend).toHaveBeenCalled();
    // chat.update fetch call
    const updateCall = mocks.fetchMock.mock.calls.find(c => c[0].endsWith("/chat.update"));
    expect(updateCall).toBeDefined();
  });

  it("reject: deletes pending, transitions, updates slack, no SQS", async () => {
    mocks.getContentById.mockResolvedValueOnce({ SK: "2026#01HX", id: "01HX" });

    await __test.processAction(payloadFor("reject"), "xoxb", "tbl", "pending", "public", "https://sqs/queue");

    expect(mocks.deletePending).toHaveBeenCalledWith("01HX");
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      "2026#01HX",
      "pending",
      "rejected",
      expect.objectContaining({
        moderation: expect.objectContaining({ decision: "rejected" })
      })
    );
    expect(mocks.sqsSend).not.toHaveBeenCalled();
  });

  it("approve with thread reply: caption override is applied + echoed in chat.update", async () => {
    mocks.getContentById.mockResolvedValueOnce({
      SK: "2026#01HX",
      id: "01HX",
      originalKey: "pending/01HX/original.jpg"
    });
    mocks.copyToPublic.mockResolvedValueOnce({ copiedKeys: ["public/01HX/original.jpg"] });
    mocks.fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        messages: [
          { text: "original card", bot_id: "B1" },
          { text: "Better caption", user: "U1" }
        ]
      })
    });
    mocks.fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) });

    await __test.processAction(payloadFor("approve"), "xoxb", "tbl", "pending", "public", "https://sqs/queue");

    const call = mocks.transitionStatus.mock.calls[0];
    expect(call[3]).toMatchObject({ caption: "Better caption" });

    const updateCall = mocks.fetchMock.mock.calls.find(c => c[0].endsWith("/chat.update"));
    expect(updateCall).toBeDefined();
    const body = JSON.parse((updateCall![1] as { body: string }).body);
    expect(body.text).toContain("Caption set to");
    expect(body.text).toContain("Better caption");
  });

  it("approve with delayed thread reply: retries once + applies caption", async () => {
    mocks.getContentById.mockResolvedValueOnce({
      SK: "2026#01HX",
      id: "01HX",
      originalKey: "pending/01HX/original.jpg"
    });
    mocks.copyToPublic.mockResolvedValueOnce({ copiedKeys: ["public/01HX/original.jpg"] });
    // First conversations.replies: only the original bot card, no user reply yet.
    mocks.fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, messages: [{ text: "original card", bot_id: "B1" }] })
    });
    // Second attempt (after retry delay): the user's reply has landed.
    mocks.fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        messages: [
          { text: "original card", bot_id: "B1" },
          { text: "Late-arriving caption", user: "U1" }
        ]
      })
    });
    mocks.fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) });

    await __test.processAction(payloadFor("approve"), "xoxb", "tbl", "pending", "public", "https://sqs/queue");

    const call = mocks.transitionStatus.mock.calls[0];
    expect(call[3]).toMatchObject({ caption: "Late-arriving caption" });
    // 2 conversations.replies + 1 chat.update = 3 slack calls total
    const repliesCalls = mocks.fetchMock.mock.calls.filter(c => c[0].endsWith("/conversations.replies"));
    expect(repliesCalls.length).toBe(2);
  });

  it("missing row: no-op", async () => {
    mocks.getContentById.mockResolvedValueOnce(undefined);
    await __test.processAction(payloadFor("approve"), "xoxb", "tbl", "pending", "public", "https://sqs/queue");
    expect(mocks.transitionStatus).not.toHaveBeenCalled();
    expect(mocks.copyToPublic).not.toHaveBeenCalled();
  });
});
