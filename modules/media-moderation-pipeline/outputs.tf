output "api_endpoint" {
  value       = module.api.api_endpoint
  description = "Invoke URL for the HTTP API (e.g., https://abc.execute-api.eu-west-2.amazonaws.com)"
}

output "public_bucket_name" {
  value = module.public_bucket.s3_bucket_id
}

output "public_bucket_regional_domain_name" {
  value = module.public_bucket.s3_bucket_bucket_regional_domain_name
}

output "public_bucket_arn" {
  value = module.public_bucket.s3_bucket_arn
}

output "pending_bucket_name" {
  value = module.pending_bucket.s3_bucket_id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.main.name
}

output "dynamodb_table_arn" {
  value = aws_dynamodb_table.main.arn
}

output "rebuild_queue_arn" {
  value = aws_sqs_queue.rebuild.arn
}

output "rebuild_queue_url" {
  value = aws_sqs_queue.rebuild.url
}

output "slack_interaction_url" {
  value       = "${module.api.api_endpoint}/api/slack-interaction"
  description = "Paste into the Slack app's Interactivity Request URL."
}
