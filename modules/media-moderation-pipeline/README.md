# media-moderation-pipeline

Reusable pipeline: users submit media (images, GIFs, short videos), the owner moderates submissions from Slack with ✅/❌ buttons, approved media lands on a CDN.

Built initially for arsenal-hub but designed to drop into any DDS project that needs the same shape.

## Usage

See `examples/arsenal-hub/` for a working consumer.

## Inputs / Outputs

Inputs and outputs are documented in `variables.tf` and `outputs.tf` respectively.
