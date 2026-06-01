# Job template used by finalize-upload to start transcoding jobs.
# A minimal 720p H.264 + JPEG poster setup. Per-job destination is set by
# the Lambda when CreateJob is called.
#
# NOTE: hashicorp/aws (5.x) does not expose aws_mediaconvert_job_template, and
# AWS::MediaConvert::JobTemplate is not a CloudFormation resource (so awscc has
# no awscc_mediaconvert_job_template either). We manage the template via the
# AWS CLI through null_resource with create/destroy local-exec provisioners.
# Triggers ensure the template is recreated when the settings change.
locals {
  mediaconvert_job_template_name = "${local.name_prefix}-video"

  mediaconvert_job_template_settings = jsonencode({
    OutputGroups = [
      {
        Name = "FileGroup"
        OutputGroupSettings = {
          Type              = "FILE_GROUP_SETTINGS"
          FileGroupSettings = {}
        }
        Outputs = [
          {
            NameModifier = "_720p"
            VideoDescription = {
              Width  = 1280
              Height = 720
              CodecSettings = {
                Codec = "H_264"
                H264Settings = {
                  Bitrate          = 3000000
                  RateControlMode  = "CBR"
                  CodecProfile     = "MAIN"
                  CodecLevel       = "AUTO"
                  EntropyEncoding  = "CABAC"
                  GopSize          = 90
                  GopSizeUnits     = "FRAMES"
                  FramerateControl = "INITIALIZE_FROM_SOURCE"
                  ParControl       = "INITIALIZE_FROM_SOURCE"
                }
              }
            }
            AudioDescriptions = [{
              CodecSettings = {
                Codec       = "AAC"
                AacSettings = { Bitrate = 96000, CodingMode = "CODING_MODE_2_0", SampleRate = 48000 }
              }
            }]
            ContainerSettings = { Container = "MP4" }
          },
          {
            NameModifier = "_poster"
            VideoDescription = {
              Width  = 1280
              Height = 720
              CodecSettings = {
                Codec                = "FRAME_CAPTURE"
                FrameCaptureSettings = { Quality = 80, FramerateNumerator = 1, FramerateDenominator = 1 }
              }
            }
            ContainerSettings = { Container = "RAW" }
            Extension         = "jpg"
          }
        ]
      }
    ]
    Inputs = [{
      AudioSelectors = { "Audio Selector 1" = { DefaultSelection = "DEFAULT" } }
      VideoSelector  = {}
    }]
  })
}

resource "null_resource" "mediaconvert_job_template" {
  triggers = {
    name     = local.mediaconvert_job_template_name
    settings = local.mediaconvert_job_template_settings
    category = "moderation"
  }

  provisioner "local-exec" {
    when    = create
    command = <<-EOT
      set -euo pipefail
      EXISTS=$(aws mediaconvert get-job-template --name "${self.triggers.name}" --query 'JobTemplate.Name' --output text 2>/dev/null || echo "")
      if [ -n "$EXISTS" ] && [ "$EXISTS" != "None" ]; then
        aws mediaconvert update-job-template \
          --name "${self.triggers.name}" \
          --category "${self.triggers.category}" \
          --description "${local.name_prefix} short-video transcode template" \
          --settings '${self.triggers.settings}'
      else
        aws mediaconvert create-job-template \
          --name "${self.triggers.name}" \
          --category "${self.triggers.category}" \
          --description "${local.name_prefix} short-video transcode template" \
          --settings '${self.triggers.settings}'
      fi
    EOT
  }

  provisioner "local-exec" {
    when       = destroy
    on_failure = continue
    command    = "aws mediaconvert delete-job-template --name ${self.triggers.name}"
  }
}
