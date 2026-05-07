variable "name" {
  description = "Identifier used for resource naming (S3 bucket prefix, CloudFront comment)."
  type        = string
}

variable "aliases" {
  description = "FQDNs the CloudFront distribution serves. Every alias must be covered by acm_certificate_arn."
  type        = list(string)
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN. MUST live in us-east-1 — CloudFront only accepts viewer certificates from us-east-1."
  type        = string
}

variable "route53_aliases" {
  description = "Route53 A-record aliases pointing to the CloudFront distribution. Each entry is { zone_id, name }. Caller owns the zones."
  type = list(object({
    zone_id = string
    name    = string
  }))
  default = []
}

variable "bucket_name" {
  description = "Override for the S3 bucket name. Defaults to \"<name>-<account-id>\" when null."
  type        = string
  default     = null
}

variable "default_root_object" {
  description = "CloudFront default root object served at /."
  type        = string
  default     = "index.html"
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 = US/Canada/Europe (cheapest); _200 adds Asia/MENA; _All adds South America/Australia."
  type        = string
  default     = "PriceClass_100"
}

variable "spa_error_responses" {
  description = "If true, CloudFront maps 403 and 404 to /index.html with status 200 — required for single-page-app client-side routing."
  type        = bool
  default     = false
}
