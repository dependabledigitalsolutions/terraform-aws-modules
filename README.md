# DDS Terraform AWS Modules

Reusable Terraform modules for AWS, used across DDS-managed projects.

This is a **pure modules library** — no opinionated baselines, no per-environment wiring. Each module is a self-contained reusable building block. Consume modules from your own root configurations using a versioned git source ref.

## Modules

| Module | Purpose | Status |
|---|---|---|
| [`account-baseline`](modules/account-baseline) | CloudWatch billing alarm + SNS + CloudTrail (single-region) | v0.1.0 |
| [`iam-identity-center`](modules/iam-identity-center) | Thin wrapper around `aws-ia/iam-identity-center/aws` with documented Entra/Google IdP option | v0.1.0 |
| [`static-website`](modules/static-website) | S3 (private, OAC) + CloudFront + Route53 alias records | v0.1.0 |
| [`route53-registered-domain`](modules/route53-registered-domain) | Domain registration (or settings-only on existing) + hosted zone | v0.1.0 |
| [`vpc-ecs-cloudfront`](modules/vpc-ecs-cloudfront) | VPC + ECS Fargate + ALB + CloudFront in front of ALB | v0.1.0 |

## IAM Identity Center: Entra / Google setup

The `iam-identity-center` module wraps `aws-ia/iam-identity-center/aws`. The Terraform side handles permission sets, group assignments, and account targeting — but the SAML federation and SCIM provisioning with your IdP is **manual** in both consoles. There is no Terraform path for either step.

### Manual prerequisites (do these before `terraform apply`)

1. **Enable IAM Identity Center** in the AWS console (one-time per account / Organization).
2. **Configure the external IdP** as the identity source — IDC console → Settings → Identity source → Change → External identity provider. Exchange SAML metadata between the IdP and IDC.
3. **Enable SCIM provisioning** in IDC. Copy the SCIM endpoint URL and bearer token.
4. **Wire SCIM in the IdP** so users and groups assigned to the AWS application sync into IDC's identity store.
5. **Assign IdP users/groups** to the AWS IDC application.

After SCIM has synced, the groups appear in IDC's identity store. Reference them via `existing_sso_groups` and use `principal_idp = "EXTERNAL"` in `account_assignments`.

### Microsoft Entra ID (Azure AD)

- Create an Enterprise Application in Entra: **AWS IAM Identity Center** (gallery app, pre-built).
- Configure SAML SSO using the metadata exchange in step 2 above.
- Configure provisioning (SCIM) using the endpoint + token from step 3.
- Assign Entra users / groups to the application — only assigned principals sync into IDC.
- Reference: [AWS docs — Connect Microsoft Entra ID](https://docs.aws.amazon.com/singlesignon/latest/userguide/azure-ad-idp.html)

### Google Workspace

- In Google Workspace admin console, add the **Amazon Web Services IAM Identity Center** SAML app.
- Set the SAML attribute mapping per AWS docs.
- For SCIM, install the AWS-provided sync utility or use Google Cloud Identity's automated provisioning.
- Reference: [AWS docs — Google Workspace as IdP](https://aws.amazon.com/blogs/security/how-to-use-g-suite-as-external-identity-provider-aws-sso/)

## Consuming a module

Always pin to a tagged version — never reference `main`:

```hcl
module "account_baseline" {
  source = "git::https://github.com/dependabledigitalsolutions/terraform-aws-modules.git//modules/account-baseline?ref=v0.1.0"

  name_prefix                 = "taf-prod"
  billing_alarm_threshold_usd = 100
  alarm_email                 = "billing@example.com"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
```

## Local development

Install [mise](https://mise.jdx.dev/), then:

```bash
mise install     # pins terraform, awscli, pre-commit to mise.toml versions
pre-commit install
```

After `pre-commit install`, every commit runs `terraform fmt`, `terraform validate`, and basic hygiene checks (trailing whitespace, EOF, merge conflict markers). Run manually:

```bash
pre-commit run --all-files
```

## Versioning

Module versioning follows semver via git tags. Breaking changes bump the major; new features bump the minor; fixes bump the patch. Consumers always pin via `?ref=vX.Y.Z`.
