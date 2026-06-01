# Example: arsenal-hub-style consumption

Mirrors the shape `arsenal-hub` itself uses. Synthetic Secrets Manager ARNs
so this can be `terraform plan`-validated without real Slack/Google
credentials.

## Validate (no AWS calls)

```bash
terraform init -backend=false
terraform validate
```

## Plan (requires AWS credentials in the target account)

```bash
terraform init
terraform plan
```

## Inputs your real consumer must override

- `slack_signing_secret_arn` — must point at a Secrets Manager secret whose value is JSON shaped `{"secret":"…"}`
- `slack_bot_token_arn` — `{"token":"xoxb-…"}`
- `google_client_id` — your Google Cloud OAuth client ID
- `slack_channel_id` — moderation channel
- `cloudfront_domain` — hostname where approved content is served from
