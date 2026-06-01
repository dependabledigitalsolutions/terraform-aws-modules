# Basic example

Minimal consumer of the module. Synthetic Secrets Manager ARNs so the example
is `terraform plan`-validatable without real Slack / Google credentials.

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

## Inputs a real consumer must override

- `slack_signing_secret_arn` — Secrets Manager ARN whose value is JSON `{"secret":"…"}`
- `slack_bot_token_arn` — Secrets Manager ARN whose value is JSON `{"token":"xoxb-…"}`
- `google_client_id` — Google Cloud OAuth client ID
- `slack_channel_id` — moderation channel ID
- `cloudfront_domain` — hostname approved content is served from
