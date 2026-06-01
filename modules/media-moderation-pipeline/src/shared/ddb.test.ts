import { describe, it, expect, vi, beforeEach } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({ send }))
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send }) },
  PutCommand: vi.fn(input => ({ name: "Put", input })),
  GetCommand: vi.fn(input => ({ name: "Get", input })),
  UpdateCommand: vi.fn(input => ({ name: "Update", input })),
  QueryCommand: vi.fn(input => ({ name: "Query", input })),
  DeleteCommand: vi.fn(input => ({ name: "Delete", input }))
}));

import { ddbHelpers } from "./ddb";

describe("ddbHelpers", () => {
  beforeEach(() => send.mockReset());

  it("isBanned returns true when BAN row exists", async () => {
    send.mockResolvedValueOnce({ Item: { PK: "BAN", SK: "sub123" } });
    const h = ddbHelpers("test-table");
    await expect(h.isBanned("sub123")).resolves.toBe(true);
  });

  it("isBanned returns false when no BAN row", async () => {
    send.mockResolvedValueOnce({ Item: undefined });
    const h = ddbHelpers("test-table");
    await expect(h.isBanned("sub123")).resolves.toBe(false);
  });

  it("countUserUploadsSince calls Query against byUploader GSI", async () => {
    send.mockResolvedValueOnce({ Count: 3 });
    const h = ddbHelpers("test-table");
    const since = new Date("2026-05-31T00:00:00Z");
    const n = await h.countUserUploadsSince("sub123", since);
    expect(n).toBe(3);
    const call = send.mock.calls[0][0];
    expect(call.input.IndexName).toBe("byUploader");
  });

  it("getContentById queries byId GSI", async () => {
    send.mockResolvedValueOnce({ Items: [{ id: "01HX", PK: "CONTENT", SK: "2026#01HX" }] });
    const h = ddbHelpers("test-table");
    const row = await h.getContentById("01HX");
    expect(row?.id).toBe("01HX");
    const call = send.mock.calls[0][0];
    expect(call.input.IndexName).toBe("byId");
  });

  it("historyForUploader counts by status", async () => {
    send.mockResolvedValueOnce({ Items: [
      { status: "approved" }, { status: "approved" }, { status: "rejected" },
      { status: "pending" }, { status: "expired" }
    ]});
    const h = ddbHelpers("test-table");
    const hist = await h.historyForUploader("sub1");
    expect(hist).toEqual({ approved: 2, rejected: 1, expired: 1 });
  });
});
