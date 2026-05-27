"""Format application-domain events delivered via EventBridge → SNS.

When an EventBridge rule targets the alerting SNS topic, the EB event is
serialised into Records[0].Sns.Message as a JSON string. The shape is:

    {
      "detail-type": "complaint.created",
      "source":      "tasty-erp",
      "account":     "...",
      "region":      "...",
      "time":        "...",
      "detail": {
        "title":     "...",      (recommended)
        "body":      "...",      (optional, will be truncated)
        "link_path": "https://..." or "/complaints/abc",  (optional)
        "notify_channels": ["slack", "email"],  (the routing flag the
                                                 producer set)
        ...event-specific fields...
      }
    }

This handler is purposefully tolerant — events without title/body still
produce a useful message using detail-type and the raw detail fields.
"""

import json
import logging
from io import StringIO

from handlers.handler import EventHandler

logger = logging.getLogger()

# Metadata keys we surface in their own places, so we don't repeat them in
# the generic "context fields" footer.
_RESERVED_DETAIL_KEYS = frozenset({
    "title", "body", "link_path", "notify_channels", "notify_emails",
})

# Channel name a producer puts in notify_channels to ask for an email.
_EMAIL_CHANNEL = "email"

# Cap body and field values so a chatty event can't drown the channel.
_BODY_MAX_CHARS = 500
_FIELD_MAX_CHARS = 200


class ProductEventHandler(EventHandler):
    def is_event_as_expected(self, event):
        try:
            message = event["Records"][0]["Sns"]["Message"]
        except (KeyError, IndexError, TypeError):
            return False
        try:
            payload = json.loads(message)
        except (TypeError, ValueError):
            return False
        return (
            isinstance(payload, dict)
            and "detail-type" in payload
            and "source" in payload
            and isinstance(payload.get("detail"), dict)
        )

    def build_message_string(self, event):
        payload = json.loads(event["Records"][0]["Sns"]["Message"])
        detail_type = payload.get("detail-type", "event")
        source = payload.get("source", "unknown")
        detail = payload.get("detail", {}) or {}

        title = detail.get("title") or detail_type
        body = detail.get("body")
        link_path = detail.get("link_path")

        message = StringIO()
        message.write(f"🔔 *{title}*\n")
        message.write(f"_{source} / {detail_type}_\n")

        if body:
            truncated = body if len(body) <= _BODY_MAX_CHARS else body[:_BODY_MAX_CHARS - 1] + "…"
            message.write(f"\n{truncated}\n")

        if link_path:
            if isinstance(link_path, str) and link_path.startswith(("http://", "https://")):
                message.write(f"\n<{link_path}|Open>")
            else:
                message.write(f"\n*Link:* {link_path}")

        # Surface any other detail fields the producer included as a footer,
        # so context (severity, branch_id, ...) isn't lost.
        extras = {
            k: v for k, v in detail.items()
            if k not in _RESERVED_DETAIL_KEYS and v not in (None, "", [], {})
        }
        if extras:
            message.write("\n")
            for k, v in extras.items():
                rendered = _render_scalar(v)
                message.write(f"\n*{k}:* {rendered}")

        return message.getvalue()

    def extra_email_recipients(self, event):
        """Read `detail.notify_emails`, but only if the producer also asked
        for email delivery via `notify_channels`. This means a producer that
        forgets the channel flag won't accidentally trigger emails."""
        try:
            payload = json.loads(event["Records"][0]["Sns"]["Message"])
        except (KeyError, IndexError, TypeError, ValueError):
            return []
        detail = payload.get("detail", {}) or {}
        channels = detail.get("notify_channels") or []
        if _EMAIL_CHANNEL not in channels:
            return []
        emails = detail.get("notify_emails") or []
        return [e for e in emails if isinstance(e, str) and "@" in e]

    def email_subject(self, event):
        try:
            payload = json.loads(event["Records"][0]["Sns"]["Message"])
        except (KeyError, IndexError, TypeError, ValueError):
            return super().email_subject(event)
        detail = payload.get("detail", {}) or {}
        return detail.get("title") or payload.get("detail-type") or super().email_subject(event)


def _render_scalar(value):
    """Coerce arbitrary detail values into a single bounded line."""
    if isinstance(value, (dict, list)):
        rendered = json.dumps(value, default=str, separators=(",", ":"))
    else:
        rendered = str(value)
    if len(rendered) > _FIELD_MAX_CHARS:
        rendered = rendered[:_FIELD_MAX_CHARS - 1] + "…"
    return rendered
