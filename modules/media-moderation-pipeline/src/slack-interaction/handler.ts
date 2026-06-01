import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ddbHelpers } from "../shared/ddb";
import { s3Helpers } from "../shared/s3";
import { verifySlackSignature } from "../shared/slack";
import { buildDecisionUpdate } from "../shared/slack-card";

interface APIGatewayProxyEventV2 {
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
}

const sm = new SecretsManagerClient({});
const sqs = new SQSClient({});

let cachedSigningSecret: string | undefined;
let cachedBotToken: string | undefined;

async function getSlackSecrets(): Promise<{ signing: string; bot: string }> {
  if (!cachedSigningSecret) {
    const s = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SLACK_SIGNING_SECRET_ARN! }));
    cachedSigningSecret = JSON.parse(s.SecretString ?? "{}").slack_signing_secret;
  }
  if (!cachedBotToken) {
    const b = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SLACK_BOT_TOKEN_ARN! }));
    cachedBotToken = JSON.parse(b.SecretString ?? "{}").slack_bot_token;
  }
  return { signing: cachedSigningSecret!, bot: cachedBotToken! };
}

async function slackApi(method: string, body: object, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return res.json() as Promise<Record<string, unknown>>;
}

interface SlackInteractionPayload {
  actions: Array<{ action_id: string; value: string }>;
  user: { name: string; username?: string; profile?: { email?: string } };
  message: { ts: string };
  channel: { id: string };
}

async function processAction(
  payload: SlackInteractionPayload,
  bot: string,
  tableName: string,
  pending: string,
  publicBkt: string,
  rebuildQueueUrl: string
): Promise<void> {
  const action = payload.actions[0];
  const id = action.value;
  const decision: "approved" | "rejected" = action.action_id.startsWith("approve_") ? "approved" : "rejected";
  const actor = payload.user.profile?.email ?? payload.user.username ?? payload.user.name;

  const ddb = ddbHelpers(tableName);
  const s3 = s3Helpers({ pendingBucket: pending, publicBucket: publicBkt });

  const row = await ddb.getContentById(id);
  if (!row) return;

  if (decision === "approved") {
    let captionOverride: string | undefined;
    const replies = (await slackApi(
      "conversations.replies",
      { channel: payload.channel.id, ts: payload.message.ts },
      bot
    )) as { messages?: Array<{ text: string; user?: string; bot_id?: string }> };
    const threadReplies = (replies.messages ?? []).slice(1).filter(m => !m.bot_id);
    if (threadReplies.length > 0) captionOverride = threadReplies[threadReplies.length - 1].text;

    const copyResult = await s3.copyToPublic(id);
    await ddb.transitionStatus(row.SK, "pending", "approved", {
      publicKey: copyResult.copiedKeys[0],
      thumbKey: copyResult.copiedKeys.find(k => k.endsWith("/thumb.webp")),
      ...(captionOverride ? { caption: captionOverride } : {}),
      moderation: {
        actor,
        decision: "approved",
        decidedAt: new Date().toISOString(),
        slackMessageTs: payload.message.ts
      }
    });
    await sqs.send(new SendMessageCommand({
      QueueUrl: rebuildQueueUrl,
      MessageBody: id,
      DelaySeconds: 30
    }));
  } else {
    await s3.deletePending(id);
    await ddb.transitionStatus(row.SK, "pending", "rejected", {
      moderation: {
        actor,
        decision: "rejected",
        decidedAt: new Date().toISOString(),
        slackMessageTs: payload.message.ts
      }
    });
  }

  await slackApi(
    "chat.update",
    {
      channel: payload.channel.id,
      ts: payload.message.ts,
      ...buildDecisionUpdate({ id, decision, actor, decidedAtIso: new Date().toISOString() })
    },
    bot
  );
}

export async function handler(event: APIGatewayProxyEventV2) {
  const tableName = process.env.TABLE_NAME!;
  const pending = process.env.PENDING_BUCKET!;
  const publicBkt = process.env.PUBLIC_BUCKET!;
  const rebuildQueueUrl = process.env.REBUILD_QUEUE_URL!;

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString()
    : (event.body ?? "");
  const ts = event.headers["x-slack-request-timestamp"];
  const sig = event.headers["x-slack-signature"];
  if (!ts || !sig) return { statusCode: 400, body: "missing slack headers" };

  const { signing, bot } = await getSlackSecrets();
  if (!verifySlackSignature({ body: raw, timestamp: ts, signature: sig, signingSecret: signing })) {
    return { statusCode: 401, body: "bad signature" };
  }

  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") ?? "{}") as SlackInteractionPayload;

  // Slack expects an ack within 3s. Process the work after returning.
  // In Lambda, scheduled tasks survive after the handler returns; we use
  // queueMicrotask so the response can flush first.
  queueMicrotask(async () => {
    try {
      await processAction(payload, bot, tableName, pending, publicBkt, rebuildQueueUrl);
    } catch (err) {
      console.error("slack-interaction follow-up failed", err);
      try {
        await slackApi(
          "chat.postMessage",
          { channel: payload.channel.id, text: `⚠️ Action failed; check logs.` },
          bot
        );
      } catch {
        // best effort
      }
    }
  });

  return { statusCode: 200, body: "" };
}

export const __test = { processAction, getSlackSecrets, slackApi };
