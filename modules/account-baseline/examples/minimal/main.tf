provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "this" {
  source = "../.."

  name_prefix                 = "example"
  billing_alarm_threshold_usd = 100
  alarm_email                 = "billing@example.com"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
