"""Fallback handler: forward any SNS message we don't have a typed handler for.

Anything publishing to the topic with a free-form string (or a JSON payload
this Lambda doesn't have a typed handler for yet) lands here. Last in the
HANDLERS list so the typed handlers above it have priority.
"""

import logging

from handlers.handler import EventHandler

logger = logging.getLogger()


class SnsPassthroughHandler(EventHandler):
    def is_event_as_expected(self, event):
        try:
            return bool(event['Records'][0]['Sns']['Message'])
        except (KeyError, IndexError, TypeError):
            return False

    def build_message_string(self, event):
        record = event['Records'][0]['Sns']
        subject = record.get('Subject') or 'Notification'
        body = record.get('Message') or ''
        return f"📣 *{subject}*\n\n{body}"
