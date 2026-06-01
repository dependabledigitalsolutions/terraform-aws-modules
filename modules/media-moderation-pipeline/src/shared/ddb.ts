import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";
import type { ContentRow, ContentStatus, UploadStashRow } from "./types";

const raw = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(raw);

export function ddbHelpers(tableName: string) {
  return {
    async isBanned(sub: string): Promise<boolean> {
      const r = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { PK: "BAN", SK: sub }
      }));
      return !!r.Item;
    },

    async countUserUploadsSince(sub: string, since: Date): Promise<number> {
      const r = await doc.send(new QueryCommand({
        TableName: tableName,
        IndexName: "byUploader",
        KeyConditionExpression: "GSI2PK = :pk AND GSI2SK >= :since",
        ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":since": since.toISOString() },
        Select: "COUNT"
      }));
      return r.Count ?? 0;
    },

    async historyForUploader(sub: string): Promise<{ approved: number; rejected: number; expired: number }> {
      const r = await doc.send(new QueryCommand({
        TableName: tableName,
        IndexName: "byUploader",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${sub}` },
        ProjectionExpression: "#s",
        ExpressionAttributeNames: { "#s": "status" }
      }));
      const items = (r.Items ?? []) as Array<{ status: ContentStatus }>;
      const out = { approved: 0, rejected: 0, expired: 0 };
      for (const it of items) {
        if (it.status === "approved") out.approved++;
        else if (it.status === "rejected") out.rejected++;
        else if (it.status === "expired") out.expired++;
      }
      return out;
    },

    async putContent(row: ContentRow): Promise<void> {
      await doc.send(new PutCommand({ TableName: tableName, Item: row }));
    },

    async getContent(sk: string): Promise<ContentRow | undefined> {
      const r = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { PK: "CONTENT", SK: sk }
      }));
      return r.Item as ContentRow | undefined;
    },

    async getContentById(id: string): Promise<ContentRow | undefined> {
      const r = await doc.send(new QueryCommand({
        TableName: tableName,
        IndexName: "byId",
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: { ":id": id },
        Limit: 1
      }));
      return r.Items?.[0] as ContentRow | undefined;
    },

    async transitionStatus(
      sk: string,
      from: ContentStatus,
      to: ContentStatus,
      extra: Record<string, unknown> = {}
    ): Promise<ContentRow | undefined> {
      const sets = ["#s = :to", "GSI1PK = :gsi1pk", "updatedAt = :now"];
      const values: Record<string, unknown> = {
        ":from": from,
        ":to": to,
        ":gsi1pk": `STATUS#${to}`,
        ":now": new Date().toISOString()
      };
      const names: Record<string, string> = { "#s": "status" };
      let i = 0;
      for (const [k, v] of Object.entries(extra)) {
        if (v === undefined) continue;  // DDB rejects undefined attribute values
        const ph = `:e${i}`;
        const nh = `#e${i}`;
        names[nh] = k;
        values[ph] = v;
        sets.push(`${nh} = ${ph}`);
        i++;
      }
      const r = await doc.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: "CONTENT", SK: sk },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "#s = :from",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW"
      }));
      return r.Attributes as ContentRow | undefined;
    },

    async putStash(stash: UploadStashRow): Promise<void> {
      await doc.send(new PutCommand({ TableName: tableName, Item: stash }));
    },

    async takeStash(ulid: string): Promise<UploadStashRow | undefined> {
      const r = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `UPLOAD#${ulid}`, SK: "STASH" }
      }));
      if (!r.Item) return undefined;
      await doc.send(new DeleteCommand({
        TableName: tableName,
        Key: { PK: `UPLOAD#${ulid}`, SK: "STASH" }
      }));
      return r.Item as UploadStashRow;
    },

    async listApproved(opts: { limit: number; mood?: string; nextKey?: Record<string, unknown> }): Promise<{
      items: ContentRow[];
      nextKey?: Record<string, unknown>;
    }> {
      const queryArgs: Record<string, unknown> = {
        TableName: tableName,
        IndexName: "byStatus",
        KeyConditionExpression: "GSI1PK = :pk",
        ScanIndexForward: false,
        Limit: opts.limit,
        ExclusiveStartKey: opts.nextKey
      };
      if (opts.mood) {
        queryArgs.FilterExpression = "mood = :mood";
        queryArgs.ExpressionAttributeValues = { ":pk": "STATUS#approved", ":mood": opts.mood };
      } else {
        queryArgs.ExpressionAttributeValues = { ":pk": "STATUS#approved" };
      }
      const r = await doc.send(new QueryCommand(queryArgs as ConstructorParameters<typeof QueryCommand>[0]));
      return {
        items: (r.Items ?? []) as ContentRow[],
        nextKey: r.LastEvaluatedKey
      };
    }
  };
}
