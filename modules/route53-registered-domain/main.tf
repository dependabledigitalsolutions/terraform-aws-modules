# Two operating modes, switched by var.register_new:
#   register_new = true  → aws_route53domains_domain  PURCHASES the domain
#   register_new = false → aws_route53domains_registered_domain manages an
#                          already-registered domain (settings only, no charge)
# Both resources only work in us-east-1 — the Route 53 Domains registrar API
# has no other regional endpoints. Caller wires the us-east-1 provider via:
#   providers = { aws.us_east_1 = aws.us_east_1 }

resource "aws_route53_zone" "this" {
  count = var.create_zone ? 1 : 0
  name  = var.domain_name
}

locals {
  contact_block = {
    first_name        = var.contact.first_name
    last_name         = var.contact.last_name
    contact_type      = var.contact.contact_type
    organization_name = var.contact.organization_name
    address_line_1    = var.contact.address_line_1
    city              = var.contact.city
    state             = var.contact.state
    country_code      = var.contact.country_code
    zip_code          = var.contact.zip_code
    phone_number      = var.contact.phone_number
    email             = var.contact.email
  }

  name_servers = var.create_zone ? aws_route53_zone.this[0].name_servers : []
}

resource "aws_route53domains_domain" "this" {
  provider = aws.us_east_1
  count    = var.register_new ? 1 : 0

  domain_name       = var.domain_name
  duration_in_years = var.duration_in_years
  auto_renew        = var.auto_renew

  admin_privacy      = var.privacy
  registrant_privacy = var.privacy
  tech_privacy       = var.privacy

  dynamic "name_server" {
    for_each = local.name_servers
    content {
      name = name_server.value
    }
  }

  admin_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }

  registrant_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }

  tech_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }
}

resource "aws_route53domains_registered_domain" "this" {
  provider = aws.us_east_1
  count    = var.register_new ? 0 : 1

  domain_name = var.domain_name
  auto_renew  = var.auto_renew

  admin_privacy      = var.privacy
  registrant_privacy = var.privacy
  tech_privacy       = var.privacy

  dynamic "name_server" {
    for_each = local.name_servers
    content {
      name = name_server.value
    }
  }

  admin_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }

  registrant_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }

  tech_contact {
    first_name        = local.contact_block.first_name
    last_name         = local.contact_block.last_name
    contact_type      = local.contact_block.contact_type
    organization_name = local.contact_block.organization_name
    address_line_1    = local.contact_block.address_line_1
    city              = local.contact_block.city
    state             = local.contact_block.state
    country_code      = local.contact_block.country_code
    zip_code          = local.contact_block.zip_code
    phone_number      = local.contact_block.phone_number
    email             = local.contact_block.email
  }
}
