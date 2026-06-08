// Public, unauthenticated. Returns the most-recently-published READ rows.
// Sorted newest-first via ScanIndexForward=false on the SK
// ("{publishedAt iso}#{urlHash}").

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ReadRow } from "../shared/types";

const raw = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(raw);

interface Event {
  queryStringParameters?: { limit?: string; source?: string };
}

export async function handler(event: Event) {
  const limit = Math.min(Number(event.queryStringParameters?.limit ?? 30), 100);
  const sourceFilter = event.queryStringParameters?.source;

  const queryArgs: Record<string, unknown> = {
    TableName: process.env.TABLE_NAME!,
    KeyConditionExpression: "PK = :pk",
    ScanIndexForward: false,
    Limit: limit
  };
  if (sourceFilter) {
    queryArgs.FilterExpression = "#s = :source";
    queryArgs.ExpressionAttributeNames = { "#s": "source" };
    queryArgs.ExpressionAttributeValues = { ":pk": "READ", ":source": sourceFilter };
  } else {
    queryArgs.ExpressionAttributeValues = { ":pk": "READ" };
  }

  const r = await doc.send(new QueryCommand(queryArgs as ConstructorParameters<typeof QueryCommand>[0]));
  const items = (r.Items ?? []).map(it => {
    const row = it as unknown as ReadRow;
    return {
      url: row.url,
      source: row.source,
      title: row.title,
      summary: row.summary,
      publishedAt: row.publishedAt
    };
  });

  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    body: JSON.stringify({ items })
  };
}
