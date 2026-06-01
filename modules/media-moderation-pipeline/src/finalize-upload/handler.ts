import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { MediaConvertClient, CreateJobCommand } from "@aws-sdk/client-mediaconvert";
import { ddbHelpers } from "../shared/ddb";
import { s3Helpers } from "../shared/s3";
import { detectMime } from "../shared/magic-bytes";
import { buildSubmissionCard } from "../shared/slack-card";
import { processImage } from "./image-pipeline";
import type { ContentRow } from "../shared/types";

interface S3EventRecord {
  s3: { object: { key: string } };
}
interface S3Event { Records: S3EventRecord[] }

const sm = new SecretsManagerClient({});
const mc = new MediaConvertClient({});

async function postSlackCard(card: ReturnType<typeof buildSubmissionCard>, channelId: string, botTokenSecretArn: string): Promise<{ ts: string }> {
  const tokenJson = await sm.send(new GetSecretValueCommand({ SecretId: botTokenSecretArn }));
  const token = JSON.parse(tokenJson.SecretString ?? "{}").token as string;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: channelId, ...card })
  });
  const json = await res.json() as { ok: boolean; ts?: string };
  if (!json.ok) throw new Error(`slack post failed`);
  return { ts: json.ts! };
}

export async function handler(event: S3Event) {
  const tableName = process.env.TABLE_NAME!;
  const pending = process.env.PENDING_BUCKET!;
  const publicBkt = process.env.PUBLIC_BUCKET!;
  const slackChannel = process.env.SLACK_CHANNEL_ID!;
  const slackBotTokenArn = process.env.SLACK_BOT_TOKEN_ARN!;
  const mcRoleArn = process.env.MEDIACONVERT_ROLE_ARN!;
  const mcJobTemplate = process.env.MEDIACONVERT_JOB_TEMPLATE!;

  const ddb = ddbHelpers(tableName);
  const s3 = s3Helpers({ pendingBucket: pending, publicBucket: publicBkt });

  for (const rec of event.Records) {
    const key = decodeURIComponent(rec.s3.object.key);
    const m = key.match(/^pending\/([^/]+)\/original\.([a-z0-9]+)$/i);
    if (!m) continue;
    const id = m[1];

    const stash = await ddb.takeStash(id);
    if (!stash) {
      await s3.deletePending(id);
      continue;
    }

    const head = await s3.fetchHead(key, 16);
    const detected = detectMime(head);
    if (!detected) {
      await s3.deletePending(id);
      continue;
    }

    const now = new Date();
    const iso = now.toISOString();
    const isVideo = detected.startsWith("video/");
    const status = isVideo ? "transcoding" : "pending";

    const row: ContentRow = {
      PK: "CONTENT",
      SK: `${iso}#${id}`,
      id,
      type: isVideo ? "video" : detected === "image/gif" ? "gif" : "image",
      status,
      mood: stash.mood,
      uploaderSub: stash.uploaderSub,
      uploaderName: stash.uploaderName,
      uploaderEmail: stash.uploaderEmail,
      caption: stash.caption,
      originalKey: key,
      GSI1PK: `STATUS#${status}`,
      GSI1SK: iso,
      GSI2PK: `USER#${stash.uploaderSub}`,
      GSI2SK: iso,
      createdAt: iso,
      updatedAt: iso
    };
    await ddb.putContent(row);

    if (isVideo) {
      await mc.send(new CreateJobCommand({
        Role: mcRoleArn,
        JobTemplate: mcJobTemplate,
        UserMetadata: { ulid: id, sk: row.SK },
        Settings: {
          Inputs: [{ FileInput: `s3://${pending}/${key}` }],
          OutputGroups: [
            {
              OutputGroupSettings: {
                Type: "FILE_GROUP_SETTINGS",
                FileGroupSettings: { Destination: `s3://${pending}/pending/${id}/` }
              },
              Outputs: [
                { NameModifier: "_720p" },
                { NameModifier: "_poster" }
              ]
            }
          ]
        }
      }));
      continue;
    }

    const processed = await processImage({ s3, pending, ulid: id, ext: m[2], detected });
    const thumbUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${processed.thumbKey}`;
    const history = await ddb.historyForUploader(stash.uploaderSub);
    const card = buildSubmissionCard({
      id,
      type: row.type,
      uploaderName: stash.uploaderName,
      uploaderEmail: stash.uploaderEmail,
      mood: stash.mood,
      caption: stash.caption,
      thumbUrl,
      history
    });
    await postSlackCard(card, slackChannel, slackBotTokenArn);
  }
}
