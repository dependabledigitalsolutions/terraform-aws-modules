locals {
  alb_origin_id = "${var.name}-alb"
}

# Shared secret between CloudFront and ALB. Add an ALB listener rule on the
# consumer side that requires this header value if you want to fully block
# direct ALB access — the security-group prefix list is the primary defence.
resource "random_password" "cloudfront_secret" {
  length  = 32
  special = false
}

module "cdn" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 3.0"

  aliases             = var.cloudfront_aliases
  comment             = var.name
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = var.cloudfront_price_class
  retain_on_delete    = false
  wait_for_deployment = false

  viewer_certificate = {
    acm_certificate_arn      = var.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  origin = {
    (local.alb_origin_id) = {
      domain_name = var.alb_origin_domain
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
      custom_header = [
        {
          name  = "X-CloudFront-Secret"
          value = random_password.cloudfront_secret.result
        }
      ]
    }
  }

  default_cache_behavior = {
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]

    use_forwarded_values     = false
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
    compress                 = true
  }
}
