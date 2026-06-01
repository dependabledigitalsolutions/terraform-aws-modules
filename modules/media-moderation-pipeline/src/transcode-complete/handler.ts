import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ddbHelpers } from "../shared/ddb";
import { buildSubmissionCard } from "../shared/slack-card";

interface MCEvent {
  detail: {
    status: "COMPLETE" | "ERROR";
    jobId: string;
    userMetadata?: { ulid?: string; sk?: string };
    outputGroupDetails?: Array<{
      outputDetails?: Array<{
        outputFilePaths?: string[];
        durationInMs?: number;
        videoDetails?: { widthInPx?: number; heightInPx?: number };
      }>;
    }>;
  };
}

const sm = new SecretsManagerClient({});
const s3 = new S3Client({});

async function postSlack(channelId: string, botSecretArn: string, body: object): Promise<void> {
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: botSecretArn }));
  const token = JSON.parse(secret.SecretString ?? "{}").slack_bot_token;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: channelId, ...body })
  });
  const json = await res.json() as { ok: boolean; error?: string };
  if (!json.ok) {
    console.error("Slack post failed:", json.error, JSON.stringify(body).slice(0, 500));
    throw new Error(`Slack chat.postMessage failed: ${json.error}`);
  }
}

export async function handler(event: MCEvent) {
  const tableName = process.env.TABLE_NAME!;
  const slackChannel = process.env.SLACK_CHANNEL_ID!;
  const botArn = process.env.SLACK_BOT_TOKEN_ARN!;
  const maxDurSecs = Number(process.env.MAX_VIDEO_DURATION_SECS ?? 30);

  const sk = event.detail.userMetadata?.sk;
  const id = event.detail.userMetadata?.ulid;
  if (!sk || !id) return;

  const ddb = ddbHelpers(tableName);

  if (event.detail.status === "ERROR") {
    await ddb.transitionStatus(sk, "transcoding", "rejected", {
      moderation: { actor: "system", decision: "rejected", decidedAt: new Date().toISOString() }
    });
    await postSlack(slackChannel, botArn, { text: `⚠️ Transcode failed for ${id} — auto-rejected.` });
    return;
  }

  const detail = event.detail.outputGroupDetails?.[0]?.outputDetails?.[0];
  const durationSecs = (detail?.durationInMs ?? 0) / 1000;
  if (durationSecs > maxDurSecs) {
    await ddb.transitionStatus(sk, "transcoding", "rejected", {
      moderation: { actor: "system", decision: "rejected", decidedAt: new Date().toISOString() }
    });
    await postSlack(slackChannel, botArn, { text: `⚠️ Video ${id} exceeds ${maxDurSecs}s — auto-rejected.` });
    return;
  }

  const posterKey = `pending/${id}/original_poster.0000000.jpg`;
  const videoKey  = `pending/${id}/original_720p.mp4`;

  const updated = await ddb.transitionStatus(sk, "transcoding", "pending", {
    duration: durationSecs,
    width:  detail?.videoDetails?.widthInPx,
    height: detail?.videoDetails?.heightInPx,
    thumbKey: posterKey,
    variants: { w800: videoKey }
  });
  if (!updated) return;

  const pendingBucket = process.env.PENDING_BUCKET!;
  const thumbUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: pendingBucket, Key: posterKey }),
    { expiresIn: 86400 }
  );

  const history = await ddb.historyForUploader(updated.uploaderSub);
  const card = buildSubmissionCard({
    id,
    type: "video",
    uploaderName: updated.uploaderName,
    uploaderEmail: updated.uploaderEmail,
    mood: updated.mood,
    caption: updated.caption,
    thumbUrl: thumbUrl,
    history
  });
  await postSlack(slackChannel, botArn, card);
}
