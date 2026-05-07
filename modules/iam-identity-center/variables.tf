variable "external_idp" {
  description = "External SAML IdP that provisions users/groups via SCIM. One of \"entra\" (Microsoft Entra ID), \"google\" (Google Workspace), or null for IDC's built-in directory. SAML metadata exchange and SCIM endpoint setup are MANUAL — see README. This variable is informational and gates wrapper validation; the upstream module behaviour is identical either way."
  type        = string
  default     = null

  validation {
    condition     = var.external_idp == null || contains(["entra", "google"], var.external_idp)
    error_message = "external_idp must be \"entra\", \"google\", or null."
  }
}

variable "permission_sets" {
  description = "Permission sets to create. Map keyed by short name. See aws-ia/iam-identity-center/aws docs for the structure."
  type        = any
  default     = {}
}

variable "existing_permission_sets" {
  description = "Existing AWS-managed permission sets to reference by name (e.g. AWSAdministratorAccess, AWSReadOnlyAccess)."
  type        = any
  default     = {}
}

variable "sso_groups" {
  description = "Groups to create directly in the IDC identity store. Use only when external_idp is null — SCIM-synced groups come via existing_sso_groups."
  type        = any
  default     = {}
}

variable "existing_sso_groups" {
  description = "Groups synced from external IdP, looked up by display name. Required when external_idp is set."
  type        = any
  default     = {}
}

variable "sso_users" {
  description = "Users to create directly in the IDC identity store. Use only when external_idp is null — SCIM-synced users come via existing_sso_users."
  type        = any
  default     = {}
}

variable "existing_sso_users" {
  description = "Users synced from external IdP, looked up by user name. Required when external_idp is set."
  type        = any
  default     = {}
}

variable "account_assignments" {
  description = "Account assignments mapping principals to permission sets and target accounts. Set principal_idp = \"EXTERNAL\" for SCIM-synced principals, \"INTERNAL\" for IDC-created principals."
  type        = any
  default     = {}
}
