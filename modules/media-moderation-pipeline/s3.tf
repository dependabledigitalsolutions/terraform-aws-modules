module "pending_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.2"

  bucket = "${local.name_prefix}-pending"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  versioning = {
    status = "Enabled"
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  lifecycle_rule = [{
    id         = "expire-pending"
    enabled    = true
    filter     = { prefix = "pending/" }
    expiration = { days = var.pending_ttl_days }
  }]

  cors_rule = [{
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${var.cloudfront_domain}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }]

  tags = local.default_tags
}

module "public_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.2"

  bucket = "${local.name_prefix}-public"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  versioning = {
    status = "Enabled"
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  tags = local.default_tags
}
