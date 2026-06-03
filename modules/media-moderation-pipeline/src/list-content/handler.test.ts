import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listApproved: vi.fn()
}));

vi.mock("../shared/ddb", () => ({
  ddbHelpers: () => ({ listApproved: mocks.listApproved })
}));

import { handler } from "./handler";

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  Object.assign(process.env, {
    TABLE_NAME: "tbl",
    CLOUDFRONT_DOMAIN: "cdn.example.com"
  });
});

describe("list-content handler", () => {
  it("returns approved items mapped to public-shape with CDN urls", async () => {
    mocks.listApproved.mockResolvedValueOnce({
      items: [{
        id: "01HX",
        type: "image",
        mood: "trophy",
        uploaderName: "Jane",
        uploaderEmail: "j@g.com",   // must NOT appear in output
        caption: "Cup celebration",
        thumbKey: "public/01HX/thumb.webp",
        publicKey: "public/01HX/main.jpg",
        createdAt: "2026-06-01T12:00:00Z"
      }],
      nextKey: undefined
    });

    const r = await handler({});
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.items[0].id).toBe("01HX");
    expect(body.items[0].thumb).toBe("https://cdn.example.com/public/01HX/thumb.webp");
    expect(body.items[0].image).toBe("https://cdn.example.com/public/01HX/main.jpg");
    expect(JSON.stringify(body)).not.toContain("j@g.com");
    expect(body.nextKey).toBeNull();
  });

  it("passes through the mood filter", async () => {
    mocks.listApproved.mockResolvedValueOnce({ items: [], nextKey: undefined });
    await handler({ queryStringParameters: { mood: "trophy" } });
    expect(mocks.listApproved).toHaveBeenCalledWith(expect.objectContaining({ mood: "trophy" }));
  });

  it("encodes pagination nextKey as base64 of the JSON", async () => {
    const lastEvalKey = { PK: "CONTENT", SK: "2026#01HX" };
    mocks.listApproved.mockResolvedValueOnce({ items: [], nextKey: lastEvalKey });

    const r = await handler({});
    const body = JSON.parse(r.body);
    expect(body.nextKey).toBeTypeOf("string");
    const decoded = JSON.parse(Buffer.from(body.nextKey, "base64").toString());
    expect(decoded).toEqual(lastEvalKey);
  });

  it("decodes incoming nextKey from base64", async () => {
    mocks.listApproved.mockResolvedValueOnce({ items: [], nextKey: undefined });
    const incomingKey = { PK: "CONTENT", SK: "2026#01OLD" };
    const encoded = Buffer.from(JSON.stringify(incomingKey)).toString("base64");
    await handler({ queryStringParameters: { nextKey: encoded } });
    expect(mocks.listApproved).toHaveBeenCalledWith(
      expect.objectContaining({ nextKey: incomingKey })
    );
  });

  it("caps limit at 100 even if a higher value is requested", async () => {
    mocks.listApproved.mockResolvedValueOnce({ items: [], nextKey: undefined });
    await handler({ queryStringParameters: { limit: "500" } });
    expect(mocks.listApproved).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("surfaces non-zero reaction_* attrs as a reactions map", async () => {
    mocks.listApproved.mockResolvedValueOnce({
      items: [{
        id: "01HX",
        type: "image",
        uploaderName: "Jane",
        createdAt: "2026-06-01T12:00:00Z",
        reaction_red: 5,
        reaction_goal: 0,            // zero filtered out
        reaction_hands: 12
      }],
      nextKey: undefined
    });
    const r = await handler({});
    const body = JSON.parse(r.body);
    expect(body.items[0].reactions).toEqual({ red: 5, hands: 12 });
  });
});
