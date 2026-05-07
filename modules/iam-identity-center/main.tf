# Thin wrapper around aws-ia/iam-identity-center/aws.
#
# Why the wrapper exists:
#   - Pins the upstream version so client repos don't drift independently.
#   - Surfaces var.external_idp as a documented decision point (entra / google
#     / null built-in) so the IdP choice is visible in client tfvars.
#   - Provides a single import path for DDS-managed clients: any future
#     defaults or DDS-wide conventions land here without touching consumers.
#
# Manual prerequisites (no Terraform path exists for any of these):
#   1. Enable IAM Identity Center in the AWS console.
#   2. If external_idp is set: configure SAML metadata exchange in BOTH the
#      IdP console (Entra Enterprise App / Google Workspace SAML app) AND the
#      IDC "Choose your identity source" page.
#   3. Enable SCIM provisioning in IDC, copy the SCIM endpoint + bearer token
#      to the IdP, and assign IdP users/groups to the AWS application.
#   4. After SCIM syncs, reference synced principals via existing_sso_groups
#      / existing_sso_users with principal_idp = "EXTERNAL" in account_assignments.
#
# See the modules-repo README for the IdP-specific walkthrough.

module "this" {
  source  = "aws-ia/iam-identity-center/aws"
  version = "~> 1.0"

  permission_sets          = var.permission_sets
  existing_permission_sets = var.existing_permission_sets
  sso_groups               = var.sso_groups
  existing_sso_groups      = var.existing_sso_groups
  sso_users                = var.sso_users
  existing_sso_users       = var.existing_sso_users
  account_assignments      = var.account_assignments
}
