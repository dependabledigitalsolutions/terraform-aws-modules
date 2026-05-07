output "bucket_id" {
  description = "S3 bucket ID — used by CI/CD to sync website assets."
  value       = module.bucket.s3_bucket_id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = module.bucket.s3_bucket_arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used by CI/CD to invalidate cache."
  value       = module.cdn.cloudfront_distribution_id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = module.cdn.cloudfront_distribution_arn
}

output "cloudfront_domain_name" {
  description = "CloudFront-issued domain name (use as alias target if creating Route53 records outside this module)."
  value       = module.cdn.cloudfront_distribution_domain_name
}
