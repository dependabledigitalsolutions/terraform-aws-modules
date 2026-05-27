data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-alerting"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

# CloudWatch Logs — always
resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SES SendEmail — only when SES output is enabled
data "aws_iam_policy_document" "ses" {
  count = local.ses_enabled ? 1 : 0
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ses" {
  count  = local.ses_enabled ? 1 : 0
  name   = "ses-send"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.ses[0].json
}
