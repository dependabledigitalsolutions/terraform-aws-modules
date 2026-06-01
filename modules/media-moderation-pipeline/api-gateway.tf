module "api" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "~> 5.0"

  name          = "${local.name_prefix}-api"
  description   = "${local.name_prefix} upload + list + slack-interaction"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["https://${var.cloudfront_domain}"]
    max_age       = 300
  }

  create_domain_name = false

  routes = {
    "POST /api/sign-upload" = {
      integration = {
        uri                    = module.sign_upload.lambda_function_arn
        type                   = "AWS_PROXY"
        payload_format_version = "2.0"
      }
    }
    "POST /api/slack-interaction" = {
      integration = {
        uri                    = module.slack_interaction.lambda_function_arn
        type                   = "AWS_PROXY"
        payload_format_version = "2.0"
      }
    }
    "GET /api/list-content" = {
      integration = {
        uri                    = module.list_content.lambda_function_arn
        type                   = "AWS_PROXY"
        payload_format_version = "2.0"
      }
    }
  }

  tags = local.default_tags
}

resource "aws_lambda_permission" "api_sign_upload" {
  statement_id  = "AllowAPISignUpload"
  action        = "lambda:InvokeFunction"
  function_name = module.sign_upload.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api.api_execution_arn}/*/*/api/sign-upload"
}

resource "aws_lambda_permission" "api_slack" {
  statement_id  = "AllowAPISlackInteraction"
  action        = "lambda:InvokeFunction"
  function_name = module.slack_interaction.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api.api_execution_arn}/*/*/api/slack-interaction"
}

resource "aws_lambda_permission" "api_list" {
  statement_id  = "AllowAPIListContent"
  action        = "lambda:InvokeFunction"
  function_name = module.list_content.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.api.api_execution_arn}/*/*/api/list-content"
}
