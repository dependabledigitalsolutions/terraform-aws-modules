locals {
  topic_name = "${var.name_prefix}-alerts"

  # SNS topic to subscribe to — either created here, or one the caller
  # already owns.
  topic_arn = var.existing_sns_topic_arn != null ? var.existing_sns_topic_arn : aws_sns_topic.this[0].arn

  slack_enabled = var.slack_webhook_ssm_parameter_name != null
  teams_enabled = var.teams_webhook_ssm_parameter_name != null
  chime_enabled = var.chime_webhook_ssm_parameter_name != null
  # SES is enabled whenever a sender is configured — recipients may be supplied
  # statically via var.ses_recipients (broadcast pattern) or per-event by a
  # handler (e.g. ProductEventHandler reading detail.notify_emails). Either is
  # enough reason to turn the SES output and IAM permission on.
  ses_enabled = var.ses_sender_email != null

  # SSM parameters the Lambda needs IAM read access to.
  ssm_parameter_names = compact([
    var.slack_webhook_ssm_parameter_name,
    var.teams_webhook_ssm_parameter_name,
    var.chime_webhook_ssm_parameter_name,
  ])
}

# ---------------------------------------------------------------------------
# SNS topic (only when not reusing an existing one)
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "this" {
  count = var.existing_sns_topic_arn == null ? 1 : 0
  name  = local.topic_name
  tags  = var.tags
}

# ---------------------------------------------------------------------------
# Webhook lookup (apply-time read of the SecureString into the Lambda env)
# ---------------------------------------------------------------------------

data "aws_ssm_parameter" "slack_webhook" {
  count           = local.slack_enabled ? 1 : 0
  name            = var.slack_webhook_ssm_parameter_name
  with_decryption = true
}

data "aws_ssm_parameter" "teams_webhook" {
  count           = local.teams_enabled ? 1 : 0
  name            = var.teams_webhook_ssm_parameter_name
  with_decryption = true
}

data "aws_ssm_parameter" "chime_webhook" {
  count           = local.chime_enabled ? 1 : 0
  name            = var.chime_webhook_ssm_parameter_name
  with_decryption = true
}

# ---------------------------------------------------------------------------
# Lambda
# ---------------------------------------------------------------------------

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/src/alerting"
  output_path = "${path.module}/.build/${var.name_prefix}-alerting.zip"

  # Unit tests live alongside the handlers so the `from handlers.* import`
  # paths resolve the same way they do in the Lambda runtime, but they
  # don't belong in the deployed zip.
  excludes = ["tests", "tests/__init__.py", "tests/test_handlers.py"]
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name_prefix}-alerting"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "alerting" {
  function_name = "${var.name_prefix}-alerting"
  description   = "Fan SNS-published alerts out to Slack/Teams/Chime/SES"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  handler       = "alerting.lambda_handler"
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds
  architectures = ["arm64"]

  environment {
    variables = {
      enable_slack_output    = local.slack_enabled ? "true" : "false"
      slack_webhook          = local.slack_enabled ? data.aws_ssm_parameter.slack_webhook[0].value : ""
      slack_channel_name     = var.slack_channel_override == null ? "" : var.slack_channel_override
      slack_webhook_username = var.slack_username == null ? "" : var.slack_username

      enable_teams_output = local.teams_enabled ? "true" : "false"
      teams_webhook       = local.teams_enabled ? data.aws_ssm_parameter.teams_webhook[0].value : ""

      enable_chime_output = local.chime_enabled ? "true" : "false"
      chime_webhook       = local.chime_enabled ? data.aws_ssm_parameter.chime_webhook[0].value : ""

      enable_ses_email_output = local.ses_enabled ? "true" : "false"
      ses_sender_email        = var.ses_sender_email == null ? "" : var.ses_sender_email
      email_recipients        = join(",", var.ses_recipients)
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
  tags       = var.tags
}

# ---------------------------------------------------------------------------
# Subscribe Lambda to SNS topic
# ---------------------------------------------------------------------------

resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = local.topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alerting.arn
}

resource "aws_lambda_permission" "sns_invoke" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alerting.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = local.topic_arn
}
