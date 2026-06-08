import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({ send: mocks.send }))
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockImplementation(() => ({ send: mocks.send }))
  },
  QueryCommand: vi.fn().mockImplementation(input => ({ kind: "Query", input }))
}));

import { handler } from "./handler";

const ROWS = [
  {
    PK: "READ",
    SK: "2026-06-03T09:00:00Z#abc123",
    url: "https://arseblog.com/preview-chelsea/",
    source: "Arseblog",
    title: "Match preview",
    summary: "Big game",
    publishedAt: "2026-06-03T09:00:00Z",
    fetchedAt: "2026-06-03T12:00:00Z",
    ttl: 9999999999
  }
];

beforeEach(() => {
  mocks.send.mockReset();
  Object.assign(process.env, { TABLE_NAME: "tbl" });
});

describe("list-reads handler", () => {
  it("returns the items in DDB order, stripped of internal fields", async () => {
    mocks.send.mockResolvedValueOnce({ Items: ROWS });
    const r = await handler({});
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      url: "https://arseblog.com/preview-chelsea/",
      source: "Arseblog",
      title: "Match preview",
      summary: "Big game",
      publishedAt: "2026-06-03T09:00:00Z"
    });
    // Internal-only fields not leaked
    expect(Object.keys(body.items[0])).not.toContain("ttl");
    expect(Object.keys(body.items[0])).not.toContain("SK");
    expect(Object.keys(body.items[0])).not.toContain("fetchedAt");
  });

  it("caps limit at 100", async () => {
    mocks.send.mockResolvedValueOnce({ Items: [] });
    await handler({ queryStringParameters: { limit: "500" } });
    const call = mocks.send.mock.calls[0][0];
    expect(call.input.Limit).toBe(100);
  });

  it("applies source filter when present", async () => {
    mocks.send.mockResolvedValueOnce({ Items: [] });
    await handler({ queryStringParameters: { source: "Arseblog" } });
    const call = mocks.send.mock.calls[0][0];
    expect(call.input.FilterExpression).toBe("#s = :source");
    expect(call.input.ExpressionAttributeValues[":source"]).toBe("Arseblog");
  });

  it("queries newest-first via ScanIndexForward=false", async () => {
    mocks.send.mockResolvedValueOnce({ Items: [] });
    await handler({});
    const call = mocks.send.mock.calls[0][0];
    expect(call.input.ScanIndexForward).toBe(false);
    expect(call.input.KeyConditionExpression).toBe("PK = :pk");
    expect(call.input.ExpressionAttributeValues[":pk"]).toBe("READ");
  });
});
