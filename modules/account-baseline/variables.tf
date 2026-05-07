variable "name_prefix" {
  description = "Prefix applied to billing-alarm resource names (e.g. \"taf-prod\")."
  type        = string
}

variable "billing_alarm_threshold_usd" {
  description = "Estimated AWS charges (USD) at which the billing alarm fires."
  type        = number
}

variable "alarm_email" {
  description = "Email address subscribed to the billing-alarm SNS topic. Confirm via the link AWS sends after first apply before the alarm can deliver notifications."
  type        = string
}

variable "enable_cloudtrail" {
  description = "Whether to create a single-account CloudTrail trail with an S3 log bucket. Disable when an org-level trail already covers the account."
  type        = bool
  default     = true
}

variable "cloudtrail_multi_region" {
  description = "If true, the trail captures events across all regions and includes global-service events. Single-region (false) is cheaper but only captures the consumer's primary region."
  type        = bool
  default     = false
}

variable "cloudtrail_log_retention_days" {
  description = "Days CloudTrail logs are retained in S3 before lifecycle expiration."
  type        = number
  default     = 90
}

variable "cloudtrail_bucket_force_destroy" {
  description = "If true, the CloudTrail S3 bucket can be destroyed even when it contains logs. Set false in production where audit retention matters."
  type        = bool
  default     = true
}
