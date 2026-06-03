// Anonymous emoji reactions on an approved item. Fixed five-key set so
// counts stay aggregatable; counts are stored as top-level
// `reaction_<key>` numbers on the CONTENT row (DDB ADD on top-level
// numbers is atomic and cheap, nested-map ADD isn't supported).
//
// Best-effort dedup happens client-side via localStorage. Anonymous so the
// friction is zero; if spam becomes a real problem we'll add per-IP
// rate limiting or require sign-in.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const raw = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(raw);

export const ALLOWED_EMOJIS = ["red", "goal", "hands", "goat", "mind"] as const;
type EmojiKey = (typeof ALLOWED_EMOJIS)[number];
const ALLOWED_SET = new Set<string>(ALLOWED_EMOJIS);

interface Event {
  body: string | null;
}

interface Body {
  id?: string;
  emoji?: string;
}

function reply(statusCode: number, body: unknown) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler(event: Event) {
  let body: Body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const { id, emoji } = body;
  if (typeof id !== "string" || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) {
    return reply(400, { error: "invalid_id" });
  }
  if (typeof emoji !== "string" || !ALLOWED_SET.has(emoji)) {
    return reply(400, { error: "invalid_emoji", allowed: ALLOWED_EMOJIS });
  }
  const emojiKey = emoji as EmojiKey;
  const tableName = process.env.TABLE_NAME!;

  // Find the row via the byId GSI. We only allow reactions on approved
  // items; pending / rejected / expired rows are off-limits so reactors
  // can't bump items that aren't on the public feed.
  const lookup = await doc.send(new QueryCommand({
    TableName: tableName,
    IndexName: "byId",
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: { ":id": id },
    Limit: 1
  }));
  const row = lookup.Items?.[0];
  if (!row) return reply(404, { error: "not_found" });
  if (row.status !== "approved") return reply(403, { error: "not_approved" });

  const attrName = `reaction_${emojiKey}`;
  const r = await doc.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: "CONTENT", SK: row.SK },
    UpdateExpression: "ADD #r :one",
    ExpressionAttributeNames: { "#r": attrName },
    ExpressionAttributeValues: { ":one": 1 },
    ReturnValues: "UPDATED_NEW"
  }));

  return reply(200, {
    id,
    emoji: emojiKey,
    count: r.Attributes?.[attrName] ?? 1
  });
}
