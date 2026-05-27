"""Format GuardDuty findings forwarded to SNS by EventBridge."""

import logging
from io import StringIO

from handlers.handler import EventHandler

logger = logging.getLogger()


class GuarddutyFindingHandler(EventHandler):
    def is_event_as_expected(self, event):
        return isinstance(event, dict) and "Finding_Type" in event

    def build_message_string(self, event):
        account_id = event.get("Account_Id")
        region = event.get("region")
        finding_type = event.get("Finding_Type")
        finding_description = event.get("Finding_description")
        finding_id = event.get("Finding_ID")
        first_seen = event.get("eventFirstSeen")
        last_seen = event.get("eventLastSeen")

        message = StringIO()
        message.write(
            f"🛡️ *GuardDuty finding* in account {account_id} ({region})\n\n"
        )
        message.write(f"*Type:* {finding_type}\n")
        message.write(f"*Description:* {finding_description}\n")
        message.write(f"*Finding ID:* {finding_id}\n")
        message.write(f"*First seen:* {first_seen}\n")
        message.write(f"*Last seen:* {last_seen}")

        return message.getvalue()
