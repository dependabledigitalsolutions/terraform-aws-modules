output "vpc_id" {
  description = "VPC ID."
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs."
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "Private subnet IDs (use for ECS tasks)."
  value       = module.vpc.private_subnets
}

output "ecs_cluster_arn" {
  description = "ECS Fargate cluster ARN."
  value       = module.ecs_cluster.cluster_arn
}

output "ecs_cluster_name" {
  description = "ECS Fargate cluster name."
  value       = module.ecs_cluster.cluster_name
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks (use as the task's network configuration)."
  value       = module.ecs_sg.security_group_id
}

output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "ALB DNS name. Caller wires alb_origin_domain → this DNS via Route53 alias."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted-zone ID (use in Route53 alias record)."
  value       = aws_lb.this.zone_id
}

output "alb_security_group_id" {
  description = "ALB security group ID."
  value       = module.alb_sg.security_group_id
}

output "target_group_arn" {
  description = "ECS target group ARN — register the ECS service against this."
  value       = aws_lb_target_group.ecs.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used by CI/CD to invalidate cache."
  value       = module.cdn.cloudfront_distribution_id
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront-issued domain name (use as alias target for public-facing Route53 records)."
  value       = module.cdn.cloudfront_distribution_domain_name
}

output "cloudfront_distribution_hosted_zone_id" {
  description = "CloudFront hosted zone ID (use in Route53 alias record)."
  value       = module.cdn.cloudfront_distribution_hosted_zone_id
}

output "cloudfront_secret_header" {
  description = "Random shared-secret header CloudFront sends to the ALB. Add an ALB listener rule requiring this header to fully block direct ALB access."
  value       = random_password.cloudfront_secret.result
  sensitive   = true
}
