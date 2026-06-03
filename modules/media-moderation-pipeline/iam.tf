data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  lambda_basic_exec = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------- sign-upload ----------
resource "aws_iam_role" "sign_upload" {
  name               = "${local.name_prefix}-sign-upload"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "sign_upload_basic" {
  role       = aws_iam_role.sign_upload.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "sign_upload" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${module.pending_bucket.s3_bucket_arn}/pending/*"]
  }
  statement {
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
}
resource "aws_iam_role_policy" "sign_upload" {
  role   = aws_iam_role.sign_upload.id
  name   = "inline"
  policy = data.aws_iam_policy_document.sign_upload.json
}

# ---------- finalize-upload ----------
resource "aws_iam_role" "finalize_upload" {
  name               = "${local.name_prefix}-finalize-upload"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "finalize_upload_basic" {
  role       = aws_iam_role.finalize_upload.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "finalize_upload" {
  statement {
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      module.pending_bucket.s3_bucket_arn,
      "${module.pending_bucket.s3_bucket_arn}/*"
    ]
  }
  statement {
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
  statement {
    actions   = ["mediaconvert:CreateJob"]
    resources = ["*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.mediaconvert.arn]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.slack_bot_token_arn]
  }
}
resource "aws_iam_role_policy" "finalize_upload" {
  role   = aws_iam_role.finalize_upload.id
  name   = "inline"
  policy = data.aws_iam_policy_document.finalize_upload.json
}

# ---------- slack-interaction ----------
resource "aws_iam_role" "slack_interaction" {
  name               = "${local.name_prefix}-slack-interaction"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "slack_interaction_basic" {
  role       = aws_iam_role.slack_interaction.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "slack_interaction" {
  statement {
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      module.pending_bucket.s3_bucket_arn,
      "${module.pending_bucket.s3_bucket_arn}/*",
      module.public_bucket.s3_bucket_arn,
      "${module.public_bucket.s3_bucket_arn}/*"
    ]
  }
  statement {
    actions = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.rebuild.arn]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.slack_signing_secret_arn, var.slack_bot_token_arn]
  }
}
resource "aws_iam_role_policy" "slack_interaction" {
  role   = aws_iam_role.slack_interaction.id
  name   = "inline"
  policy = data.aws_iam_policy_document.slack_interaction.json
}

# ---------- transcode-complete ----------
resource "aws_iam_role" "transcode_complete" {
  name               = "${local.name_prefix}-transcode-complete"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "transcode_complete_basic" {
  role       = aws_iam_role.transcode_complete.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "transcode_complete" {
  statement {
    actions = ["dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.slack_bot_token_arn]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${module.pending_bucket.s3_bucket_arn}/*"]
  }
}
resource "aws_iam_role_policy" "transcode_complete" {
  role   = aws_iam_role.transcode_complete.id
  name   = "inline"
  policy = data.aws_iam_policy_document.transcode_complete.json
}

# ---------- ingest-url (admin) ----------
resource "aws_iam_role" "ingest_url" {
  name               = "${local.name_prefix}-ingest-url"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "ingest_url_basic" {
  role       = aws_iam_role.ingest_url.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "ingest_url" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${module.pending_bucket.s3_bucket_arn}/pending/*"]
  }
  statement {
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
}
resource "aws_iam_role_policy" "ingest_url" {
  role   = aws_iam_role.ingest_url.id
  name   = "inline"
  policy = data.aws_iam_policy_document.ingest_url.json
}

# ---------- list-content ----------
resource "aws_iam_role" "list_content" {
  name               = "${local.name_prefix}-list-content"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "list_content_basic" {
  role       = aws_iam_role.list_content.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "list_content" {
  statement {
    actions = ["dynamodb:Query"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
}
resource "aws_iam_role_policy" "list_content" {
  role   = aws_iam_role.list_content.id
  name   = "inline"
  policy = data.aws_iam_policy_document.list_content.json
}

# ---------- react (anonymous emoji reactions) ----------
resource "aws_iam_role" "react" {
  name               = "${local.name_prefix}-react"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.default_tags
}
resource "aws_iam_role_policy_attachment" "react_basic" {
  role       = aws_iam_role.react.name
  policy_arn = local.lambda_basic_exec
}
data "aws_iam_policy_document" "react" {
  statement {
    actions = ["dynamodb:Query", "dynamodb:UpdateItem"]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
}
resource "aws_iam_role_policy" "react" {
  role   = aws_iam_role.react.id
  name   = "inline"
  policy = data.aws_iam_policy_document.react.json
}

# ---------- MediaConvert role ----------
data "aws_iam_policy_document" "mediaconvert_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["mediaconvert.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "mediaconvert" {
  name               = "${local.name_prefix}-mediaconvert"
  assume_role_policy = data.aws_iam_policy_document.mediaconvert_trust.json
  tags               = local.default_tags
}
data "aws_iam_policy_document" "mediaconvert" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${module.pending_bucket.s3_bucket_arn}/*"]
  }
}
resource "aws_iam_role_policy" "mediaconvert" {
  role   = aws_iam_role.mediaconvert.id
  name   = "inline"
  policy = data.aws_iam_policy_document.mediaconvert.json
}
