locals {
  name_prefix = "${var.name}-${var.environment}"

  lambda_runtime            = "nodejs20.x"
  lambda_arch               = "arm64"
  lambda_log_retention_days = 30

  default_tags = merge(var.tags, {
    Module = "media-moderation-pipeline"
  })

  has_mood_taxonomy = length(var.mood_taxonomy) > 0
}
