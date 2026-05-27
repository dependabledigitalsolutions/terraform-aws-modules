variable "name_prefix" {
  description = "Prefix applied to every resource the module creates (e.g. \"dds-ops\", \"tasty-erp-dev\")."
  type        = string
}

# ---------------------------------------------------------------------------
# SNS topic
# ---------------------------------------------------------------------------

variable "existing_sns_topic_arn" {
  description = "If set, the module subscribes its Lambda to an existing SNS topic instead of creating a new one. Use this when the consumer already has a topic alarms publish to."
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Destinations — webhooks are read from SSM Parameter Store SecureString so
# rotating a webhook doesn't need a Terraform plan / apply.
#
# Each `*_webhook_ssm_parameter_name` is the parameter path (e.g. /dds/ops/
# slack-webhook-url). The module reads the value at apply-time and injects
# it into the Lambda env. Leave a parameter name unset to disable that
# destination.
# ---------------------------------------------------------------------------

variable "slack_webhook_ssm_parameter_name" {
  description = "SSM Parameter Store path holding the Slack incoming-webhook URL (SecureString). When set, the Lambda posts every message to this Slack webhook."
  type        = string
  default     = null
}

variable "slack_channel_override" {
  description = "Optional channel override (e.g. \"#alerts-tasty-erp\"). When unset, Slack uses the channel the webhook is bound to."
  type        = string
  default     = null
}

variable "slack_username" {
  description = "Optional username displayed on Slack messages (e.g. \"AWS Alerts\")."
  type        = string
  default     = null
}

variable "teams_webhook_ssm_parameter_name" {
  description = "SSM Parameter Store path holding the Microsoft Teams incoming-webhook URL (SecureString)."
  type        = string
  default     = null
}

variable "chime_webhook_ssm_parameter_name" {
  description = "SSM Parameter Store path holding the Amazon Chime incoming-webhook URL (SecureString)."
  type        = string
  default     = null
}

variable "ses_sender_email" {
  description = "From address for SES emails. Leave null to disable SES output."
  type        = string
  default     = null
}

variable "ses_recipients" {
  description = "Recipient email addresses for SES output."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# Lambda config
# ---------------------------------------------------------------------------

variable "lambda_runtime" {
  description = "Python runtime for the alerting Lambda."
  type        = string
  default     = "python3.13"
}

variable "lambda_memory_mb" {
  description = "Lambda memory size."
  type        = number
  default     = 256
}

variable "lambda_timeout_seconds" {
  description = "Lambda timeout."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda log group."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
