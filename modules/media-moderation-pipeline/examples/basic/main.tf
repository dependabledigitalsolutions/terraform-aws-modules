# Plan-time-only example. Provides synthetic Secrets Manager ARNs so the
# module plan validates without standing up real Slack/Google credentials.

resource "random_pet" "demo_secret_signing" { length = 2 }
resource "random_pet" "demo_secret_bot" { length = 2 }

resource "aws_secretsmanager_secret" "slack_signing" {
  name = "media-moderation-example-signing-${random_pet.demo_secret_signing.id}"
}
resource "aws_secretsmanager_secret" "slack_bot" {
  name = "media-moderation-example-bot-${random_pet.demo_secret_bot.id}"
}

module "pipeline" {
  source = "../.."

  providers = {
    aws      = aws
    aws.use1 = aws.use1
  }

  name        = "media-moderation-example"
  environment = "dev"

  mood_taxonomy            = ["trophy", "goals"]
  allowed_content_types    = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"]
  google_client_id         = "example.apps.googleusercontent.com"
  slack_signing_secret_arn = aws_secretsmanager_secret.slack_signing.arn
  slack_bot_token_arn      = aws_secretsmanager_secret.slack_bot.arn
  slack_channel_id         = "C00EXAMPLE"
  cloudfront_domain        = "example.invalid"

  tags = { Project = "media-moderation-example" }
}

output "api_endpoint" {
  value = module.pipeline.api_endpoint
}

output "slack_interaction_url" {
  value = module.pipeline.slack_interaction_url
}
