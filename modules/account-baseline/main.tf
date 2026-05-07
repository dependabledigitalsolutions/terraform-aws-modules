# AWS billing metrics live only in us-east-1 — every resource here uses the
# us_east_1 provider alias, which the consumer wires in via:
#   providers = { aws.us_east_1 = aws.us_east_1 }

resource "aws_sns_topic" "billing_alarm" {
  provider = aws.us_east_1
  name     = "${var.name_prefix}-billing-alarm"
}

resource "aws_sns_topic_subscription" "billing_alarm_email" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.billing_alarm.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "estimated_charges" {
  provider = aws.us_east_1

  alarm_name          = "${var.name_prefix}-estimated-charges"
  alarm_description   = "Estimated AWS charges exceeded ${var.billing_alarm_threshold_usd} USD"
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  statistic           = "Maximum"
  period              = 86400 # billing metrics update once per day
  evaluation_periods  = 1
  threshold           = var.billing_alarm_threshold_usd
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    Currency = "USD"
  }

  alarm_actions = [aws_sns_topic.billing_alarm.arn]
  ok_actions    = [aws_sns_topic.billing_alarm.arn]
}
