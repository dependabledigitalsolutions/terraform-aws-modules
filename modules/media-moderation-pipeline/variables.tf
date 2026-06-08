variable "name" {
  type        = string
  description = "Prefix for all resource names."
}

variable "environment" {
  type        = string
  description = "Environment suffix (e.g., 'prod')"
}

variable "mood_taxonomy" {
  type        = list(string)
  default     = []
  description = "Allowed mood tag values. Empty = no mood field."
}

variable "allowed_content_types" {
  type        = list(string)
  description = "MIME types the upload endpoint accepts."
}

variable "max_image_size_bytes" {
  type    = number
  default = 10485760
}

variable "max_video_size_bytes" {
  type    = number
  default = 52428800
}

variable "max_video_duration_secs" {
  type    = number
  default = 30
}

variable "uploads_per_day_per_user" {
  type    = number
  default = 5
}

variable "admin_emails" {
  type        = list(string)
  default     = []
  description = "Email addresses (matched against the Google id_token 'email' claim) treated as admins. Admin uploads are subject to admin_uploads_per_day_per_user instead of the regular cap."
}

variable "admin_uploads_per_day_per_user" {
  type        = number
  default     = 500
  description = "Daily upload cap for admin emails. Used for one-off bulk-seed runs; keep it high enough for an initial import but not unlimited."
}

variable "read_feeds" {
  type = list(object({
    url    = string
    source = string
  }))
  default     = []
  description = "RSS / Atom feeds the fetch-reads Lambda will pull on its schedule. Each entry: { url, source }. Empty list disables the scheduled fetch (Lambda stays deployed but no EventBridge fires)."
}

variable "read_fetch_schedule" {
  type        = string
  default     = "rate(6 hours)"
  description = "EventBridge cron expression for the fetch-reads Lambda."
}

variable "read_ttl_days" {
  type        = number
  default     = 90
  description = "DynamoDB item TTL on READ rows. Older entries auto-prune."
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth client ID used as the JWT audience claim."
}

variable "slack_signing_secret_arn" {
  type        = string
  description = "Secrets Manager ARN containing the Slack signing secret (key 'secret')."
}

variable "slack_bot_token_arn" {
  type        = string
  description = "Secrets Manager ARN containing the Slack bot token (key 'token')."
}

variable "slack_channel_id" {
  type        = string
  description = "Slack channel ID where moderation cards are posted."
}

variable "pending_ttl_days" {
  type    = number
  default = 7
}

variable "cloudfront_domain" {
  type        = string
  description = "Hostname (no scheme) where approved public content is served."
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "sharp_layer_arn" {
  description = "ARN of a Lambda layer providing Sharp for arm64 (matches the lambda_arch local). The layer must be in the same account (or shared with it) as the deployer."
  type        = string
}
