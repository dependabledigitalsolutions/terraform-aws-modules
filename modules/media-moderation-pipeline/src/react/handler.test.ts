import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn()
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({ send: mocks.send }))
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockImplementation(() => ({ send: mocks.send }))
  },
  QueryCommand: vi.fn().mockImplementation(input => ({ kind: "Query", input })),
  UpdateCommand: vi.fn().mockImplementation(input => ({ kind: "Update", input }))
}));

import { handler, ALLOWED_EMOJIS } from "./handler";

const APPROVED_ROW = {
  PK: "CONTENT",
  SK: "2026#01HX1234567890ABCDEFGHJKMN",
  id: "01HX1234567890ABCDEFGHJKMN",
  status: "approved"
};

function evt(body: object | null) {
  return { body: body === null ? null : JSON.stringify(body) };
}

beforeEach(() => {
  mocks.send.mockReset();
  Object.assign(process.env, { TABLE_NAME: "tbl" });
});

describe("react handler", () => {
  it("happy path: increments the right attribute and returns the new count", async () => {
    mocks.send
      .mockResolvedValueOnce({ Items: [APPROVED_ROW] })                       // Query
      .mockResolvedValueOnce({ Attributes: { reaction_red: 5 } });            // Update
    const r = await handler(evt({ id: APPROVED_ROW.id, emoji: "red" }));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body).toEqual({ id: APPROVED_ROW.id, emoji: "red", count: 5 });
    const updateCall = mocks.send.mock.calls[1][0];
    expect(updateCall.kind).toBe("Update");
    expect(updateCall.input.ExpressionAttributeNames["#r"]).toBe("reaction_red");
  });

  it("400 invalid_json on bad body", async () => {
    const r = await handler({ body: "{bad" });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toBe("invalid_json");
  });

  it("400 invalid_id on a non-ULID", async () => {
    const r = await handler(evt({ id: "nope", emoji: "red" }));
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toBe("invalid_id");
  });

  it("400 invalid_emoji on a non-allowlisted key", async () => {
    const r = await handler(evt({ id: APPROVED_ROW.id, emoji: "🔥" }));
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toBe("invalid_emoji");
  });

  it("404 not_found when the item doesn't exist", async () => {
    mocks.send.mockResolvedValueOnce({ Items: [] });
    const r = await handler(evt({ id: APPROVED_ROW.id, emoji: "red" }));
    expect(r.statusCode).toBe(404);
  });

  it("403 not_approved when the item exists but isn't on the public feed", async () => {
    mocks.send.mockResolvedValueOnce({ Items: [{ ...APPROVED_ROW, status: "pending" }] });
    const r = await handler(evt({ id: APPROVED_ROW.id, emoji: "red" }));
    expect(r.statusCode).toBe(403);
  });

  it("accepts all keys in ALLOWED_EMOJIS", async () => {
    for (const emoji of ALLOWED_EMOJIS) {
      mocks.send
        .mockResolvedValueOnce({ Items: [APPROVED_ROW] })
        .mockResolvedValueOnce({ Attributes: { [`reaction_${emoji}`]: 1 } });
      const r = await handler(evt({ id: APPROVED_ROW.id, emoji }));
      expect(r.statusCode).toBe(200);
    }
  });
});
