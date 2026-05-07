# Single-account CloudTrail. Disable when an org-level trail already covers
# the account. Bucket lives in the consumer's primary region.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

module "cloudtrail_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  count = var.enable_cloudtrail ? 1 : 0

  bucket        = "${var.name_prefix}-cloudtrail-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}"
  force_destroy = var.cloudtrail_bucket_force_destroy

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  attach_policy = true
  policy        = data.aws_iam_policy_document.cloudtrail_bucket[0].json

  lifecycle_rule = [{
    id      = "expire-logs"
    enabled = true
    expiration = {
      days = var.cloudtrail_log_retention_days
    }
  }]
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  count = var.enable_cloudtrail ? 1 : 0

  statement {
    sid       = "AWSCloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [module.cloudtrail_bucket[0].s3_bucket_arn]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
  }

  statement {
    sid       = "AWSCloudTrailWrite"
    actions   = ["s3:PutObject"]
    resources = ["${module.cloudtrail_bucket[0].s3_bucket_arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_cloudtrail" "this" {
  count = var.enable_cloudtrail ? 1 : 0

  name           = "${var.name_prefix}-trail"
  s3_bucket_name = module.cloudtrail_bucket[0].s3_bucket_id

  is_multi_region_trail         = var.cloudtrail_multi_region
  include_global_service_events = var.cloudtrail_multi_region
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "WriteOnly"
    include_management_events = true
  }
}
