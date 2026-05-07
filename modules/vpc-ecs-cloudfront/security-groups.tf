# ALB ingress rules:
#   port 80  — open to all (listener immediately redirects to HTTPS, no content served)
#   port 443 — CloudFront origin IPs (managed prefix list) + dev_allowed_cidr_blocks
# All other paths to the ALB on 443 are blocked, so production traffic is
# forced through CloudFront.

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

module "alb_sg" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "${var.name}-alb"
  description = "ALB - HTTPS from CloudFront + dev CIDRs; HTTP redirect; all outbound"
  vpc_id      = module.vpc.vpc_id

  ingress_cidr_blocks = ["0.0.0.0/0"]
  ingress_rules       = ["http-80-tcp"]

  ingress_with_cidr_blocks = [
    for cidr in var.dev_allowed_cidr_blocks : {
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = cidr
      description = "HTTPS from allowed CIDR"
    }
  ]

  egress_rules = ["all-all"]
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_cloudfront" {
  security_group_id = module.alb_sg.security_group_id
  description       = "HTTPS from CloudFront origin IPs"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

module "ecs_sg" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "${var.name}-ecs"
  description = "ECS tasks - allow traffic from ALB on var.target_port"
  vpc_id      = module.vpc.vpc_id

  ingress_with_source_security_group_id = [
    {
      source_security_group_id = module.alb_sg.security_group_id
      description              = "From ALB"
      from_port                = var.target_port
      to_port                  = var.target_port
      protocol                 = "tcp"
    }
  ]
  egress_rules = ["all-all"]
}
