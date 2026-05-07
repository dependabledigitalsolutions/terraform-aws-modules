output "sns_topic_arn" {
  description = "ARN of the billing-alarm SNS topic. Subscribe additional endpoints (Slack, extra emails) here."
  value       = aws_sns_topic.billing_alarm.arn
}

output "alarm_arn" {
  description = "ARN of the CloudWatch billing alarm."
  value       = aws_cloudwatch_metric_alarm.estimated_charges.arn
}

output "cloudtrail_arn" {
  description = "ARN of the CloudTrail trail (null if enable_cloudtrail = false)."
  value       = try(aws_cloudtrail.this[0].arn, null)
}

output "cloudtrail_bucket_id" {
  description = "S3 bucket ID receiving CloudTrail logs (null if enable_cloudtrail = false)."
  value       = try(module.cloudtrail_bucket[0].s3_bucket_id, null)
}
