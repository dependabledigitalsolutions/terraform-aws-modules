import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({ send: mocks.send }))
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockImplementation(() => ({ send: mocks.send }))
  },
  PutCommand: vi.fn().mockImplementation(input => ({ kind: "Put", input }))
}));

import { handler, parseFeedXml } from "./handler";

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Arseblog</title>
    <link>https://arseblog.com/</link>
    <description>Daily Arsenal news</description>
    <item>
      <title>Match preview: Arsenal vs Chelsea</title>
      <link>https://arseblog.com/2026/06/preview-chelsea/</link>
      <description><![CDATA[<img src="https://arseblog.com/wp-content/uploads/preview.jpg" alt="Arteta" /><p>Big game on Saturday. Here's how it'll go.</p>]]></description>
      <pubDate>Wed, 03 Jun 2026 09:00:00 +0100</pubDate>
      <guid>https://arseblog.com/2026/06/preview-chelsea/</guid>
    </item>
    <item>
      <title>Saka contract talks update</title>
      <link>https://arseblog.com/2026/06/saka-contract/</link>
      <description>Latest from the negotiating table.</description>
      <pubDate>Tue, 02 Jun 2026 14:30:00 +0100</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Daily Cannon</title>
  <link href="https://dailycannon.com/"/>
  <entry>
    <title>Champions parade gallery</title>
    <link rel="alternate" href="https://dailycannon.com/2026/06/parade/"/>
    <summary>Open-top bus, hundreds of thousands of fans.</summary>
    <published>2026-06-01T20:00:00Z</published>
  </entry>
</feed>`;

beforeEach(() => {
  mocks.send.mockReset();
  Object.assign(process.env, { TABLE_NAME: "tbl" });
  vi.stubGlobal("fetch", vi.fn());
});

describe("parseFeedXml", () => {
  it("parses RSS 2.0 items with title, link, description, pubDate", () => {
    const items = parseFeedXml(RSS_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://arseblog.com/2026/06/preview-chelsea/",
      title: "Match preview: Arsenal vs Chelsea",
      summary: "Big game on Saturday. Here's how it'll go.",
      image: "https://arseblog.com/wp-content/uploads/preview.jpg"
    });
    expect(items[0].publishedAt).toMatch(/2026-06-03/);
    // CDATA + HTML tags stripped (the <img> too)
    expect(items[0].summary).not.toContain("<p>");
    expect(items[0].summary).not.toContain("<img");
    // No image in the second item — description has no <img>
    expect(items[1].image).toBeUndefined();
  });

  it("parses Atom entries with rel=alternate link", () => {
    const items = parseFeedXml(ATOM_FIXTURE);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://dailycannon.com/2026/06/parade/",
      title: "Champions parade gallery",
      summary: "Open-top bus, hundreds of thousands of fans."
    });
  });

  it("returns [] for non-RSS / unrecognised XML", () => {
    expect(parseFeedXml("<other><stuff/></other>")).toEqual([]);
  });

  it("skips items missing required fields (no link, no title)", () => {
    const xml = `<rss><channel><item><pubDate>2026-06-01</pubDate></item></channel></rss>`;
    expect(parseFeedXml(xml)).toEqual([]);
  });
});

describe("handler", () => {
  it("no feeds configured: returns 200, no-ops", async () => {
    delete process.env.READ_FEEDS;
    const r = await handler();
    expect(r.statusCode).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("happy path: fetches the feed, PutItem per parsed entry", async () => {
    process.env.READ_FEEDS = "https://arseblog.com/feed/|Arseblog";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => RSS_FIXTURE
    });
    mocks.send.mockResolvedValue({});

    const r = await handler();
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.totalAdded).toBe(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const firstCall = mocks.send.mock.calls[0][0];
    expect(firstCall.kind).toBe("Put");
    expect(firstCall.input.Item.PK).toBe("READ");
    expect(firstCall.input.Item.source).toBe("Arseblog");
    expect(firstCall.input.ConditionExpression).toBe("attribute_not_exists(PK)");
  });

  it("duplicate items (ConditionalCheckFailed) count as skipped, not errors", async () => {
    process.env.READ_FEEDS = "https://arseblog.com/feed/|Arseblog";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => RSS_FIXTURE
    });
    const conditionErr = new Error("conditional");
    (conditionErr as Error & { name: string }).name = "ConditionalCheckFailedException";
    mocks.send.mockRejectedValue(conditionErr);

    const r = await handler();
    const body = JSON.parse(r.body);
    expect(body.totalAdded).toBe(0);
    expect(body.results[0].skipped).toBe(2);
  });

  it("one bad feed doesn't break the batch — other feeds still processed", async () => {
    process.env.READ_FEEDS = "https://bad.example/feed/|Bad,https://arseblog.com/feed/|Arseblog";
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("DNS fail"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => RSS_FIXTURE
      });
    mocks.send.mockResolvedValue({});

    const r = await handler();
    const body = JSON.parse(r.body);
    expect(body.totalFeeds).toBe(2);
    expect(body.totalAdded).toBe(2);
    expect(body.results[0].error).toMatch(/DNS fail/);
  });
});
