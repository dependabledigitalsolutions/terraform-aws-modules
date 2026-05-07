output "zone_id" {
  description = "Route53 hosted zone ID (null when create_zone = false)."
  value       = try(aws_route53_zone.this[0].zone_id, null)
}

output "name_servers" {
  description = "AWS-issued name servers for the hosted zone (null when create_zone = false)."
  value       = try(aws_route53_zone.this[0].name_servers, null)
}

output "domain_name" {
  description = "Registered domain name."
  value       = var.register_new ? aws_route53domains_domain.this[0].domain_name : aws_route53domains_registered_domain.this[0].domain_name
}
