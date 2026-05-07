variable "domain_name" {
  description = "Domain to register (e.g. \"tastyafricanfood.app\")."
  type        = string
}

variable "contact" {
  description = "Contact details applied to admin, registrant, and tech contacts. Phone in +CC.NNNNNNNNNN format."
  type = object({
    first_name        = string
    last_name         = string
    organization_name = string
    address_line_1    = string
    city              = string
    state             = optional(string, "")
    country_code      = string
    zip_code          = string
    phone_number      = string
    email             = string
    contact_type      = optional(string, "COMPANY")
  })
}

variable "register_new" {
  description = "If true, the module registers a new domain via aws_route53domains_domain — this PURCHASES the domain and a payment method on AWS billing is required. If false, manages settings on an existing domain already in Route53 Domains via aws_route53domains_registered_domain (no purchase, no charge)."
  type        = bool
  default     = true
}

variable "duration_in_years" {
  description = "Registration period in years (only used when register_new = true). Most TLDs allow 1-10."
  type        = number
  default     = 1
}

variable "auto_renew" {
  description = "Whether AWS auto-renews the domain at the registry's renewal price."
  type        = bool
  default     = true
}

variable "privacy" {
  description = "Whether WHOIS privacy is enabled for admin, registrant, and tech contacts."
  type        = bool
  default     = true
}

variable "create_zone" {
  description = "If true, create a Route53 hosted zone for the domain and wire its name servers into the registration. Set false when the zone already exists."
  type        = bool
  default     = true
}
