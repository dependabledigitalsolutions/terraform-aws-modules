# ops-alerting

SNS-fed Python Lambda that fans operational alerts out to **Slack**, **Microsoft Teams**, **Amazon Chime**, and/or **SES**. Drop-in destination for CloudWatch alarms, EventBridge rules, or anything else publishing to SNS.

## Why this exists

CloudWatch alarms ship with two built-in destinations — email (via SNS email subscription) and Slack-via-AWS-Chatbot. Email is fine for a single Ops engineer, but it doesn't fan out to a team channel and it can't be retried. AWS Chatbot works but requires per-account Slack workspace authorisation, which is awkward for an MSP serving multiple AWS accounts.

This module is the lighter alternative: one SNS topic, one Python Lambda, webhook URLs stashed in SSM Parameter Store. The Lambda dispatches per-event-type to a handler (CloudWatch alarm, GuardDuty finding, or raw SNS message) and posts a formatted message to whichever destinations the consumer has configured.

## Quick start

1. **Create an incoming webhook** in the destination Slack workspace (Slack API → "Create app" → "Incoming Webhooks" → pick channel).
2. **Stash the URL** in SSM Parameter Store as a SecureString. The path is up to you — the module reads whatever you point it at.
3. **Invoke the module** and subscribe your alarms to its `sns_topic_arn`.

```hcl
resource "aws_ssm_parameter" "slack_alerts" {
  name  = "/dds/ops/slack-webhook-url"
  type  = "SecureString"
  value = "https://hooks.slack.com/services/T0XXXXXX/B0XXXXXX/abc123…"
  # Sensitive — set via tofu/terraform variable in CI, not committed.
}

module "alerting" {
  source = "github.com/dependabledigitalsolutions/terraform-aws-modules//modules/ops-alerting?ref=v0.x.0"

  name_prefix                       = "dds-ops"
  slack_webhook_ssm_parameter_name  = aws_ssm_parameter.slack_alerts.name
  slack_channel_override            = "#alerts-dds"
  slack_username                    = "AWS Ops"

  tags = { Team = "platform" }
}

resource "aws_cloudwatch_metric_alarm" "frontend_5xx" {
  alarm_name          = "dds-cloudfront-5xx"
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  # … standard alarm config …
  alarm_actions       = [module.alerting.sns_topic_arn]
  ok_actions          = [module.alerting.sns_topic_arn]
}
```

## Destinations

| Destination | Toggle | Env var(s) consumed |
|---|---|---|
| Slack | `slack_webhook_ssm_parameter_name` | `slack_webhook`, `slack_channel_name`, `slack_webhook_username` |
| Microsoft Teams | `teams_webhook_ssm_parameter_name` | `teams_webhook` |
| Amazon Chime | `chime_webhook_ssm_parameter_name` | `chime_webhook` |
| SES email | `ses_sender_email` + `ses_recipients` | `ses_sender_email`, `email_recipients` |

Every destination is independent — you can enable any subset. The Lambda no-ops a destination whose toggle is off, so an unused destination costs nothing.

## Event handlers

`src/alerting/handlers/` contains pluggable handlers. The Lambda walks `HANDLERS` in order and uses the first one whose `is_event_as_expected(event)` returns truthy.

| Handler | Event shape |
|---|---|
| `CloudWatchAlarmHandler` | SNS message JSON contains `AlarmName` — the standard CloudWatch alarm payload |
| `GuarddutyFindingHandler` | EventBridge-routed GuardDuty finding (must include `Finding_Type`) |
| `SnsPassthroughHandler` | Any other SNS message — surfaces `Subject` + raw `Message` verbatim |

Add a new typed handler by writing another `EventHandler` subclass and appending it to `HANDLERS` in `alerting.py`. Put it above `SnsPassthroughHandler` so the typed match wins.

## Rotating a webhook

Update the SSM parameter value (in the AWS console or via CLI) and run `terraform apply` once. The module re-reads the SSM value at apply-time and updates the Lambda env. No code change needed.

## Migrating from raw `aws_sns_topic` + email subscription

Replace this:

```hcl
resource "aws_sns_topic" "alerts" {
  name = "x-alerts"
}
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "ops@example.com"
}
```

With this:

```hcl
module "alerting" {
  source                            = "…/modules/ops-alerting?ref=v0.x.0"
  name_prefix                       = "x"
  slack_webhook_ssm_parameter_name  = "/x/slack-webhook-url"
}
```

…and point your alarms at `module.alerting.sns_topic_arn`. The legacy SNS topic + email subscription can be deleted once you've confirmed Slack messages are flowing.

If you have an existing SNS topic you'd rather keep (with existing subscribers), pass its ARN as `existing_sns_topic_arn` — the module subscribes its Lambda to that topic instead of creating a new one.

## Inputs / outputs

See `variables.tf` and `outputs.tf`. Webhook URLs live exclusively in SSM Parameter Store; the module never accepts them as plain Terraform variables to keep them off any developer's diff output.
