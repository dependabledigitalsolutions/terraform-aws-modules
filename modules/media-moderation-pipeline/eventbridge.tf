# Triggers transcode-complete Lambda when MediaConvert jobs finish or fail.
resource "aws_cloudwatch_event_rule" "mediaconvert_completed" {
  name        = "${local.name_prefix}-mediaconvert"
  description = "Trigger transcode-complete on MediaConvert state changes"
  event_pattern = jsonencode({
    source        = ["aws.mediaconvert"]
    "detail-type" = ["MediaConvert Job State Change"]
    detail = {
      status = ["COMPLETE", "ERROR"]
      userMetadata = {
        ulid = [{ exists = true }]
      }
    }
  })
  tags = local.default_tags
}

resource "aws_cloudwatch_event_target" "mediaconvert_target" {
  rule = aws_cloudwatch_event_rule.mediaconvert_completed.name
  arn  = module.transcode_complete.lambda_function_arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = module.transcode_complete.lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.mediaconvert_completed.arn
}
