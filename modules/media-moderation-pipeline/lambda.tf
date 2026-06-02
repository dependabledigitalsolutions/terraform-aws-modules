# Shared install step. The 5 Lambdas below all bundle from
# ${path.module}/src — if each ran `npm ci` itself, Terraform's
# default parallelism would race them on a single node_modules tree
# and crash with ENOENT/ENOTEMPTY on @aws-sdk/*, @esbuild/*, @nodelib/*.
# Running `npm ci` once here and making each Lambda depend on it
# removes the contention: the per-Lambda commands only run esbuild
# (which writes to its own dist/<name>/ subdir) and zip.
#
# Trigger: timestamp() — re-runs every apply. We can't trigger on the
# package-lock hash alone because TF state persists across CI runners
# while node_modules does not; a fresh runner with no node_modules
# would skip install if the lock hadn't changed. `npm ci` with a
# warm npm cache is ~5–15s.
resource "null_resource" "shared_install" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/src"
    command     = "npm ci"
    interpreter = ["/bin/bash", "-c"]
  }
}

# ---------- sign-upload ----------
module "sign_upload" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-sign-upload"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.sign_upload.arn
  memory_size = 512
  timeout     = 15
  publish     = true

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:sign-upload",
        ":zip ../dist/sign-upload .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME                     = aws_dynamodb_table.main.name
    PENDING_BUCKET                 = module.pending_bucket.s3_bucket_id
    PUBLIC_BUCKET                  = module.public_bucket.s3_bucket_id
    GOOGLE_CLIENT_ID               = var.google_client_id
    ALLOWED_CONTENT_TYPES          = join(",", var.allowed_content_types)
    MAX_IMAGE_SIZE_BYTES           = var.max_image_size_bytes
    MAX_VIDEO_SIZE_BYTES           = var.max_video_size_bytes
    UPLOADS_PER_DAY_PER_USER       = var.uploads_per_day_per_user
    ADMIN_EMAILS                   = join(",", var.admin_emails)
    ADMIN_UPLOADS_PER_DAY_PER_USER = var.admin_uploads_per_day_per_user
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}

# ---------- finalize-upload ----------
module "finalize_upload" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-finalize-upload"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.finalize_upload.arn
  memory_size = 1024
  timeout     = 60
  publish     = true

  layers = [var.sharp_layer_arn]

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:finalize-upload",
        ":zip ../dist/finalize-upload .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME                = aws_dynamodb_table.main.name
    PENDING_BUCKET            = module.pending_bucket.s3_bucket_id
    PUBLIC_BUCKET             = module.public_bucket.s3_bucket_id
    SLACK_BOT_TOKEN_ARN       = var.slack_bot_token_arn
    SLACK_CHANNEL_ID          = var.slack_channel_id
    MEDIACONVERT_ROLE_ARN     = aws_iam_role.mediaconvert.arn
    MEDIACONVERT_JOB_TEMPLATE = "${local.name_prefix}-video"
    CLOUDFRONT_DOMAIN         = var.cloudfront_domain
  }

  allowed_triggers = {
    s3 = {
      principal  = "s3.amazonaws.com"
      source_arn = module.pending_bucket.s3_bucket_arn
    }
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}

resource "aws_s3_bucket_notification" "pending_finalize" {
  bucket = module.pending_bucket.s3_bucket_id

  lambda_function {
    lambda_function_arn = module.finalize_upload.lambda_function_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "pending/"
  }

  depends_on = [module.finalize_upload]
}

# ---------- slack-interaction ----------
module "slack_interaction" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-slack-interaction"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.slack_interaction.arn
  memory_size = 512
  timeout     = 15
  publish     = true

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:slack-interaction",
        ":zip ../dist/slack-interaction .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME               = aws_dynamodb_table.main.name
    PENDING_BUCKET           = module.pending_bucket.s3_bucket_id
    PUBLIC_BUCKET            = module.public_bucket.s3_bucket_id
    SLACK_SIGNING_SECRET_ARN = var.slack_signing_secret_arn
    SLACK_BOT_TOKEN_ARN      = var.slack_bot_token_arn
    REBUILD_QUEUE_URL        = aws_sqs_queue.rebuild.url
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}

# ---------- transcode-complete ----------
module "transcode_complete" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-transcode-complete"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.transcode_complete.arn
  memory_size = 256
  timeout     = 30
  publish     = true

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:transcode-complete",
        ":zip ../dist/transcode-complete .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME              = aws_dynamodb_table.main.name
    SLACK_BOT_TOKEN_ARN     = var.slack_bot_token_arn
    SLACK_CHANNEL_ID        = var.slack_channel_id
    PENDING_BUCKET          = module.pending_bucket.s3_bucket_id
    MAX_VIDEO_DURATION_SECS = var.max_video_duration_secs
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}

# ---------- ingest-url (admin) ----------
module "ingest_url" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-ingest-url"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.ingest_url.arn
  # 60s timeout: server-side downloads of ~10 MB images on slow upstream.
  # 1024 MB so the whole file fits comfortably in memory before the PutObject.
  memory_size = 1024
  timeout     = 60
  publish     = true

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:ingest-url",
        ":zip ../dist/ingest-url .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME                     = aws_dynamodb_table.main.name
    PENDING_BUCKET                 = module.pending_bucket.s3_bucket_id
    PUBLIC_BUCKET                  = module.public_bucket.s3_bucket_id
    GOOGLE_CLIENT_ID               = var.google_client_id
    ALLOWED_CONTENT_TYPES          = join(",", var.allowed_content_types)
    MAX_IMAGE_SIZE_BYTES           = var.max_image_size_bytes
    MAX_VIDEO_SIZE_BYTES           = var.max_video_size_bytes
    UPLOADS_PER_DAY_PER_USER       = var.uploads_per_day_per_user
    ADMIN_EMAILS                   = join(",", var.admin_emails)
    ADMIN_UPLOADS_PER_DAY_PER_USER = var.admin_uploads_per_day_per_user
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}

# ---------- list-content ----------
module "list_content" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 7.0"

  function_name = "${local.name_prefix}-list-content"
  handler       = "index.handler"
  runtime       = local.lambda_runtime
  architectures = [local.lambda_arch]

  create_role = false
  lambda_role = aws_iam_role.list_content.arn
  memory_size = 256
  timeout     = 10
  publish     = true

  source_path = [
    {
      path = "${path.module}/src"
      commands = [
        "npm run build:list-content",
        ":zip ../dist/list-content .",
      ]
    }
  ]

  environment_variables = {
    TABLE_NAME        = aws_dynamodb_table.main.name
    CLOUDFRONT_DOMAIN = var.cloudfront_domain
  }

  cloudwatch_logs_retention_in_days = local.lambda_log_retention_days
  tags                              = local.default_tags

  depends_on = [null_resource.shared_install]
}
