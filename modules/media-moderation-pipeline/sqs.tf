resource "aws_sqs_queue" "rebuild_dlq" {
  name                      = "${local.name_prefix}-rebuild-dlq"
  message_retention_seconds = 1209600
  tags                      = local.default_tags
}

resource "aws_sqs_queue" "rebuild" {
  name                       = "${local.name_prefix}-rebuild"
  delay_seconds              = 30
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.rebuild_dlq.arn
    maxReceiveCount     = 3
  })
  tags = local.default_tags
}
