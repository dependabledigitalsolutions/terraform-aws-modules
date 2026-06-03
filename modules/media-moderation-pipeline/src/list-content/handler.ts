import { ddbHelpers } from "../shared/ddb";

const REACTION_KEYS = ["red", "goal", "hands", "goat", "mind"] as const;

function pickReactions(row: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of REACTION_KEYS) {
    const v = row[`reaction_${key}`];
    if (typeof v === "number" && v > 0) out[key] = v;
  }
  return out;
}

interface Event {
  queryStringParameters?: { mood?: string; limit?: string; nextKey?: string };
}

export async function handler(event: Event) {
  const ddb = ddbHelpers(process.env.TABLE_NAME!);
  const cdn = process.env.CLOUDFRONT_DOMAIN!;
  const limit = Math.min(Number(event.queryStringParameters?.limit ?? 60), 100);
  const mood = event.queryStringParameters?.mood;
  const nextKey = event.queryStringParameters?.nextKey
    ? JSON.parse(Buffer.from(event.queryStringParameters.nextKey, "base64").toString())
    : undefined;

  const r = await ddb.listApproved({ limit, mood, nextKey });
  const items = r.items.map(row => ({
    id: row.id,
    type: row.type,
    mood: row.mood,
    uploaderName: row.uploaderName,
    caption: row.caption,
    thumb: row.thumbKey ? `https://${cdn}/${row.thumbKey}` : undefined,
    image: row.publicKey ? `https://${cdn}/${row.publicKey}` : undefined,
    duration: row.duration,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
    reactions: pickReactions(row as unknown as Record<string, unknown>)
  }));
  const body = {
    items,
    nextKey: r.nextKey ? Buffer.from(JSON.stringify(r.nextKey)).toString("base64") : null
  };
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
