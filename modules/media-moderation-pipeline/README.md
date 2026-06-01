# media-moderation-pipeline

Reusable pipeline: users submit media (images, GIFs, short videos) → owner moderates submissions from Slack with ✅/❌ buttons → approved media lands on a CDN.

Designed to drop into any DDS project that needs this shape.

## What's in the box

- **Six Lambdas** (Node.js 20 on arm64), packaged via `terraform-aws-modules/lambda/aws`:
  - `sign-upload` — POST `/api/sign-upload`. Verifies a Google ID token, checks bans + rate limits, returns a presigned S3 PUT URL.
  - `finalize-upload` — S3 event on the pending bucket. Magic-bytes check, write DDB row, then either invoke Sharp to make image variants + post Slack card, or start a MediaConvert job for video.
  - `slack-interaction` — POST `/api/slack-interaction`. HMAC-verified. Approve copies pending → public + enqueues rebuild + updates Slack. Reject deletes pending + updates Slack.
  - `transcode-complete` — EventBridge rule on MediaConvert COMPLETE/ERROR. On success, transitions to status=pending and posts Slack. On error or over-duration, auto-rejects.
  - `list-content` — GET `/api/list-content`. Public, paginated, optional mood filter.
  - `cron-cleanup` — deferred stub for v0.1.0.
- **DynamoDB single-table** with three GSIs: `byStatus`, `byUploader`, `byId`.
- **Two S3 buckets**: `pending` (lifecycle: 7-day expiry) and `public` (CDN origin).
- **MediaConvert job template** (720p H.264 + JPEG poster). Managed via `null_resource` + `local-exec` because the AWS provider has no native resource for job templates — the terraform runner needs the AWS CLI on PATH.
- **SQS rebuild queue** (+ DLQ) for fan-out to downstream frontend rebuilders.
- **API Gateway HTTP API** with the three public routes above and proper Lambda invoke permissions.

## Sharp Lambda layer

`finalize-upload` runs Sharp from a public Lambda layer pinned in `lambda.tf` to:

`arn:aws:lambda:eu-west-2:063569685987:layer:sharp:1`

Consumers in other regions need to fork the module and override that ARN. v0.1.0 ships eu-west-2 only.

## What the consumer brings

- A Slack app with **signing secret** and **bot token** stored in Secrets Manager. The recommended pattern is to put both keys on a single secret value as JSON `{"slack_signing_secret":"…","slack_bot_token":"xoxb-…"}` and pass the same ARN for both `slack_signing_secret_arn` and `slack_bot_token_arn` — this lets you consolidate multiple app secrets onto one Secrets Manager secret without key collisions. The legacy two-secret layout (one ARN per key) still works.
- A Google OAuth client ID (used as the JWT audience claim).
- A CloudFront distribution that uses `public_bucket_regional_domain_name` as an origin (or your own CDN of choice serving the public bucket).
- Your own rebuild glue if you want one — subscribe a Lambda to `rebuild_queue_arn`.
- AWS CLI available on the terraform runner (CI runners typically have this; local applies need it installed).

## Quick start

See `examples/basic/` for a runnable consumer that validates.

## Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `name` | string | — | Resource prefix for all module resources. |
| `environment` | string | — | Environment suffix (e.g., `prod`). |
| `mood_taxonomy` | list(string) | `[]` | Allowed mood values. Empty = no mood field. |
| `allowed_content_types` | list(string) | — | MIME types the upload endpoint accepts. |
| `max_image_size_bytes` | number | `10485760` | 10MB. |
| `max_video_size_bytes` | number | `52428800` | 50MB. |
| `max_video_duration_secs` | number | `30` | Auto-reject anything longer. |
| `uploads_per_day_per_user` | number | `5` | Rate limit. |
| `google_client_id` | string | — | Google OAuth client ID; JWT audience claim. |
| `slack_signing_secret_arn` | string | — | Secrets Manager ARN; value shape `{"slack_signing_secret":"…"}`. May be the same ARN as `slack_bot_token_arn` if both keys live on one secret. |
| `slack_bot_token_arn` | string | — | Secrets Manager ARN; value shape `{"slack_bot_token":"xoxb-…"}`. May be the same ARN as `slack_signing_secret_arn`. |
| `slack_channel_id` | string | — | Slack channel ID where moderation cards land. |
| `pending_ttl_days` | number | `7` | S3 lifecycle expiry on pending objects. |
| `cloudfront_domain` | string | — | Hostname approved content is served from. |
| `tags` | map(string) | `{}` | Extra tags. |

## Outputs

| Name | Description |
|------|-------------|
| `api_endpoint` | HTTP API base URL. |
| `public_bucket_name` | Approved-content bucket name. |
| `public_bucket_regional_domain_name` | Use as CloudFront origin domain. |
| `public_bucket_arn` | Approved-content bucket ARN. |
| `pending_bucket_name` | Holding bucket (private). |
| `dynamodb_table_name` | Single-table name. |
| `dynamodb_table_arn` | Single-table ARN. |
| `rebuild_queue_arn` | SQS for rebuild fan-out. |
| `rebuild_queue_url` | Same. |
| `slack_interaction_url` | Paste into Slack app's Interactivity Request URL. |

## Slack app setup (what the consumer must do once)

1. Create a Slack app at https://api.slack.com/apps.
2. Bot Token Scopes: `chat:write`, `chat:write.public`, `channels:history`.
3. Install the app to your workspace. Copy the bot token (xoxb-…) into Secrets Manager.
4. Copy the signing secret from "Basic Information" → "App Credentials" into a second secret.
5. Once `terraform apply` has succeeded and you have `output.slack_interaction_url`, set the app's "Interactivity & Shortcuts" Request URL to that value, and add the bot to the moderation channel.

## Google OAuth setup (what the consumer must do once)

1. https://console.cloud.google.com → APIs & Services → Credentials.
2. Create an OAuth 2.0 Client ID, type Web Application.
3. Add your site's origin to authorized JavaScript origins.
4. Copy the client ID into the `google_client_id` input.

## Versioning

v0.x.y while in development. Pin to a tag in consumers.
