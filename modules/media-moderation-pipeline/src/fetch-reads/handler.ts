// Scheduled aggregator: pulls configured RSS feeds, parses them, and
// upserts each entry as a READ row. Idempotent — PutItem uses
// attribute_not_exists(PK), so an item that's already in the table from
// a previous run is silently skipped.
//
// Triggered by EventBridge on a fixed cadence (every 6h is the default
// in the wrapping module). Per-feed failures are caught and logged so
// one flaky source can't break the whole batch.

import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ReadRow } from "../shared/types";

const raw = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(raw);

const TTL_DAYS = Number(process.env.READS_TTL_DAYS ?? 90);
const PER_FEED_LIMIT = Number(process.env.READS_PER_FEED_LIMIT ?? 25);

interface Feed { url: string; source: string }

function parseFeeds(env: string | undefined): Feed[] {
  // Env var shape: "url|source,url|source,..."
  if (!env) return [];
  return env.split(",").map(pair => {
    const [url, source] = pair.split("|").map(s => s.trim());
    return { url, source };
  }).filter(f => f.url && f.source);
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function parseDate(s: string | undefined): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

interface ParsedItem {
  url: string;
  title: string;
  summary?: string;
  publishedAt: string;
}

// fast-xml-parser returns "text" for nodes containing CDATA or plain
// text; coerce to string and strip tags from descriptions.
function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Handles both RSS 2.0 (channel.item) and Atom (feed.entry). Returns
// the items already filtered to PER_FEED_LIMIT and with the required
// fields present.
export function parseFeedXml(xml: string): ParsedItem[] {
  // Default CDATA handling merges into the parent's text value (no
  // cdataPropName). textNodeName default is "#text".
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });
  const data = parser.parse(xml) as Record<string, unknown>;

  // RSS 2.0
  const channel = (data.rss as { channel?: { item?: unknown } })?.channel;
  if (channel && channel.item) {
    const arr = Array.isArray(channel.item) ? channel.item : [channel.item];
    return arr
      .slice(0, PER_FEED_LIMIT)
      .map((it): ParsedItem | null => {
        const item = it as Record<string, unknown>;
        const url = asString(item.link) || asString(item.guid);
        const title = stripHtml(asString(item.title));
        const summary = stripHtml(asString(item.description));
        const publishedAt = parseDate(asString(item.pubDate));
        if (!url || !title) return null;
        return { url, title, summary: summary || undefined, publishedAt };
      })
      .filter((x): x is ParsedItem => x !== null);
  }

  // Atom
  const feed = (data.feed as { entry?: unknown }) ?? null;
  if (feed && feed.entry) {
    const arr = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
    return arr
      .slice(0, PER_FEED_LIMIT)
      .map((it): ParsedItem | null => {
        const item = it as Record<string, unknown>;
        // Atom link may be an array of {@_href}; pick the first or "alternate" rel
        let url = "";
        const linkVal = item.link;
        if (Array.isArray(linkVal)) {
          const alt = linkVal.find(l => (l as Record<string, unknown>)["@_rel"] === "alternate");
          url = asString((alt ?? linkVal[0]) as Record<string, unknown>["@_href"]);
        } else if (linkVal && typeof linkVal === "object") {
          url = asString((linkVal as Record<string, unknown>)["@_href"]);
        } else if (typeof linkVal === "string") {
          url = linkVal;
        }
        const title = stripHtml(asString(item.title));
        const summary = stripHtml(asString(item.summary) || asString(item.content));
        const publishedAt = parseDate(asString(item.published) || asString(item.updated));
        if (!url || !title) return null;
        return { url, title, summary: summary || undefined, publishedAt };
      })
      .filter((x): x is ParsedItem => x !== null);
  }

  return [];
}

async function processFeed(feed: Feed, tableName: string): Promise<{ added: number; skipped: number }> {
  const r = await fetch(feed.url, {
    redirect: "follow",
    headers: { "user-agent": "ArsenalHub-RSS/1.0 (+https://afc.dependabledigitalsolutions.com)" }
  });
  if (!r.ok) {
    console.warn(`feed ${feed.source} ${feed.url} → ${r.status}`);
    return { added: 0, skipped: 0 };
  }
  const xml = await r.text();
  const items = parseFeedXml(xml);
  console.log(`feed ${feed.source}: ${items.length} items parsed`);

  let added = 0;
  let skipped = 0;
  const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const fetchedAt = new Date().toISOString();

  for (const item of items) {
    const row: ReadRow = {
      PK: "READ",
      SK: `${item.publishedAt}#${hash(item.url)}`,
      url: item.url,
      source: feed.source,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt,
      fetchedAt,
      ttl
    };
    try {
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: row,
        ConditionExpression: "attribute_not_exists(PK)"
      }));
      added++;
    } catch (err: unknown) {
      // ConditionalCheckFailed = already exists, expected
      if ((err as { name?: string })?.name === "ConditionalCheckFailedException") {
        skipped++;
      } else {
        throw err;
      }
    }
  }
  return { added, skipped };
}

export async function handler() {
  const tableName = process.env.TABLE_NAME!;
  const feeds = parseFeeds(process.env.READ_FEEDS);
  if (feeds.length === 0) {
    console.log("no feeds configured; nothing to do");
    return { statusCode: 200, body: "{}" };
  }
  console.log(`fetching ${feeds.length} feeds`);
  const results: Array<{ source: string; added: number; skipped: number; error?: string }> = [];
  for (const feed of feeds) {
    try {
      const r = await processFeed(feed, tableName);
      results.push({ source: feed.source, ...r });
      console.log(`feed ${feed.source}: +${r.added} new, ${r.skipped} skipped`);
    } catch (err) {
      const message = (err as Error).message;
      results.push({ source: feed.source, added: 0, skipped: 0, error: message });
      console.error(`feed ${feed.source} failed:`, message);
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      totalFeeds: feeds.length,
      totalAdded: results.reduce((s, r) => s + r.added, 0),
      results
    })
  };
}
