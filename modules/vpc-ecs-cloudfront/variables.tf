variable "name" {
  description = "Identifier used for resource naming across VPC, ALB, ECS cluster, and security groups."
  type        = string
}

# ── VPC ──────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "availability_zones" {
  description = "Availability zones to span (2 minimum for HA)."
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "If true, deploys a single NAT gateway shared across AZs (cost-optimised). Set false for one-per-AZ HA."
  type        = bool
  default     = true
}

# ── ALB ──────────────────────────────────────────────────────────────────────

variable "alb_certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener. Must be in the same region as the ALB."
  type        = string
}

variable "target_port" {
  description = "Container port the ALB target group forwards to."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "HTTP path the ALB target group health check requests."
  type        = string
  default     = "/api/health"
}

variable "dev_allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the ALB on 443 directly (bypassing CloudFront). Defaults to none — production traffic always arrives via CloudFront. Add team /32 IPs for dev access."
  type        = list(string)
  default     = []
}

# ── CloudFront ───────────────────────────────────────────────────────────────

variable "cloudfront_certificate_arn" {
  description = "ACM certificate ARN for the CloudFront distribution. MUST live in us-east-1."
  type        = string
}

variable "cloudfront_aliases" {
  description = "FQDNs the CloudFront distribution serves. Every alias must be covered by cloudfront_certificate_arn."
  type        = list(string)
}

variable "alb_origin_domain" {
  description = "Public DNS name CloudFront uses to reach the ALB (typically alb.<your-domain>). Caller creates the corresponding Route53 A-record alias to the ALB."
  type        = string
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_100 = US/Canada/Europe (cheapest)."
  type        = string
  default     = "PriceClass_100"
}
