terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}

# In a real deploy this SSM parameter is created out of band (e.g. by a
# bootstrap stack or `aws ssm put-parameter`) so the webhook URL never sits
# in a Terraform variable. Inlined here purely so the example is self-
# contained.
resource "aws_ssm_parameter" "slack_webhook" {
  name        = "/example/ops/slack-webhook-url"
  description = "Slack incoming-webhook URL for the example deployment"
  type        = "SecureString"
  value       = "https://hooks.slack.com/services/T000/B000/replace-me"

  lifecycle {
    ignore_changes = [value] # set out of band, don't churn on each apply
  }
}

module "alerting" {
  source = "../.."

  name_prefix                      = "example-ops"
  slack_webhook_ssm_parameter_name = aws_ssm_parameter.slack_webhook.name
  slack_channel_override           = "#alerts"
  slack_username                   = "AWS Ops"

  tags = {
    Example   = "ops-alerting/basic"
    ManagedBy = "terraform"
  }
}

# Subscribe a sample CloudWatch alarm to the module's SNS topic.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "example-lambda-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Any Lambda error in the example deployment."
  treat_missing_data  = "notBreaching"

  alarm_actions = [module.alerting.sns_topic_arn]
  ok_actions    = [module.alerting.sns_topic_arn]
}

output "sns_topic_arn" {
  value = module.alerting.sns_topic_arn
}
