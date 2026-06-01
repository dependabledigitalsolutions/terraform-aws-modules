import { ddbHelpers } from "../shared/ddb";

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
    createdAt: row.createdAt
  }));
  const body = {
    items,
    nextKey: r.nextKey ? Buffer.from(JSON.stringify(r.nextKey)).toString("base64") : null
  };
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
