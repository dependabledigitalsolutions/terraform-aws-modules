"""Format CloudWatch Alarm state changes that arrive via SNS."""

import json
import logging
from io import StringIO

from handlers.handler import EventHandler

logger = logging.getLogger()


class CloudWatchAlarmHandler(EventHandler):
    def is_event_as_expected(self, event):
        try:
            message = event['Records'][0]['Sns']['Message']
        except (KeyError, IndexError, TypeError):
            return False
        return "AlarmName" in message

    def build_message_string(self, event):
        sns_message = json.loads(event['Records'][0]['Sns']['Message'])

        account = sns_message.get("AWSAccountId")
        region = sns_message.get("Region")
        alarm_name = sns_message.get("AlarmName")
        alarm_description = sns_message.get("AlarmDescription")
        alarm_new_state = sns_message.get("NewStateValue")
        new_state_reason = sns_message.get("NewStateReason")
        state_change_time = sns_message.get("StateChangeTime")

        # OK transitions get a softer prefix so they don't read as incidents.
        icon = "✅" if alarm_new_state == "OK" else (
            "⚠️" if alarm_new_state == "ALARM" else "ℹ️"
        )

        message = StringIO()
        message.write(
            f"{icon} *{alarm_name}* — {alarm_new_state}\n"
        )
        message.write(f"_{alarm_description or 'no description'}_\n\n")
        message.write(f"*Account:* {account} ({region})\n")
        message.write(f"*Reason:* {new_state_reason}\n")
        message.write(f"*State changed at:* {state_change_time}")

        return message.getvalue()
