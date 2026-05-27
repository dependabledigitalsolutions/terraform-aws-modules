output "sns_topic_arn" {
  description = "SNS topic ARN — subscribe CloudWatch alarms, EventBridge rules, or anything else here."
  value       = local.topic_arn
}

output "sns_topic_name" {
  description = "SNS topic name (basename, useful when caller wants to look up via aws_sns_topic data source)."
  value       = var.existing_sns_topic_arn == null ? aws_sns_topic.this[0].name : split(":", var.existing_sns_topic_arn)[5]
}

output "lambda_function_arn" {
  description = "Alerting Lambda ARN. Subscribe additional sources (e.g. EventBridge rules) here when you want to bypass SNS."
  value       = aws_lambda_function.alerting.arn
}

output "lambda_function_name" {
  description = "Alerting Lambda function name."
  value       = aws_lambda_function.alerting.function_name
}

output "lambda_role_name" {
  description = "IAM role attached to the Lambda — caller can attach additional policies if they want to extend the handler set."
  value       = aws_iam_role.lambda.name
}
