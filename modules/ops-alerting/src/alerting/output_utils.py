"""Fan out a formatted message to whichever destinations are configured.

Slack / Teams / Chime use incoming webhooks (no SDK needed). SES uses boto3.
Each destination is toggled by an env var so the same Lambda image works
across customers with different destination sets.

Env vars:
  enable_slack_output | enable_teams_output | enable_chime_output | enable_ses_email_output
  slack_webhook, slack_channel_name (optional), slack_webhook_username (optional)
  teams_webhook
  chime_webhook
  ses_sender_email, email_recipients (comma-separated)
"""

import json
import logging
import os

import boto3
import urllib3
from botocore.exceptions import ClientError

logger = logging.getLogger()

_http = urllib3.PoolManager()


def _bool(name):
    return os.environ.get(name, "").lower() == "true"


def publish_output(message):
    publish_to_slack(message)
    publish_to_teams(message)
    publish_to_chime(message)
    publish_to_ses(message)


def publish_to_slack(message):
    if not _bool("enable_slack_output"):
        return
    url = os.environ.get("slack_webhook")
    if not url:
        logger.warning("enable_slack_output=true but slack_webhook is unset")
        return

    payload = {"text": message}
    # Optional overrides — left out by default since Slack honours the
    # webhook's bound channel/username/icon.
    channel = os.environ.get("slack_channel_name")
    if channel:
        payload["channel"] = channel if channel.startswith("#") else f"#{channel}"
    username = os.environ.get("slack_webhook_username")
    if username:
        payload["username"] = username

    _post_json("slack", url, payload)


def publish_to_teams(message):
    if not _bool("enable_teams_output"):
        return
    url = os.environ.get("teams_webhook")
    if not url:
        logger.warning("enable_teams_output=true but teams_webhook is unset")
        return
    _post_json("teams", url, {"text": message})


def publish_to_chime(message):
    if not _bool("enable_chime_output"):
        return
    url = os.environ.get("chime_webhook")
    if not url:
        logger.warning("enable_chime_output=true but chime_webhook is unset")
        return
    _post_json("chime", url, {"Content": message})


def publish_to_ses(message):
    if not _bool("enable_ses_email_output"):
        return
    sender = os.environ.get("ses_sender_email")
    recipients_str = os.environ.get("email_recipients", "")
    recipients = [r.strip() for r in recipients_str.split(",") if r.strip()]
    if not sender or not recipients:
        logger.warning("enable_ses_email_output=true but sender/recipients unset")
        return

    client = boto3.client("ses")
    for recipient in recipients:
        try:
            response = client.send_email(
                Destination={"ToAddresses": [recipient]},
                Message={
                    "Body":    {"Text":    {"Charset": "UTF-8", "Data": message}},
                    "Subject": {"Charset": "UTF-8", "Data": "AWS account alert"},
                },
                Source=sender,
            )
            logger.info("SES message id %s for %s", response["MessageId"], recipient)
        except ClientError as e:
            logger.error("SES send failed for %s: %s", recipient, e.response["Error"]["Message"])


def _post_json(dest, url, payload):
    encoded = json.dumps(payload).encode("utf-8")
    response = _http.request("POST", url, body=encoded, headers={"Content-Type": "application/json"})
    if response.status >= 400:
        logger.error("%s webhook returned %s: %s", dest, response.status, response.data)
    else:
        logger.info("%s webhook accepted (%s)", dest, response.status)
