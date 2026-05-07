provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "this" {
  source = "../.."

  domain_name = "example.app"

  contact = {
    first_name        = "Example"
    last_name         = "Person"
    organization_name = "Example Ltd"
    address_line_1    = "1 Example Street"
    city              = "London"
    country_code      = "GB"
    zip_code          = "SW1A 1AA"
    phone_number      = "+44.2071234567"
    email             = "contact@example.com"
  }

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
