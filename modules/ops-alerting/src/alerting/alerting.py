"""Lambda entrypoint.

Receives events from the SNS topic the module creates and (optionally) from
EventBridge rules consumers wire to the same Lambda for richer event types.
Each registered EventHandler decides whether it can format the event;
the first one that says yes wins. SnsPassthroughHandler is last so any
unrecognised SNS message still goes to the configured destinations.
"""

import logging

from handlers.cloudwatch_alarms import CloudWatchAlarmHandler
from handlers.guardduty import GuarddutyFindingHandler
from handlers.product_event import ProductEventHandler
from handlers.sns_passthrough import SnsPassthroughHandler
from output_utils import publish_output

logger = logging.getLogger()
logger.setLevel("INFO")

# Order matters: most-specific matcher first. SnsPassthroughHandler stays
# last so any unrecognised SNS message still reaches the destinations.
HANDLERS = [
    CloudWatchAlarmHandler(),
    GuarddutyFindingHandler(),
    ProductEventHandler(),
    SnsPassthroughHandler(),
]


def lambda_handler(event, context):
    logger.info("Received event: %s", event)
    for handler in HANDLERS:
        if handler.is_event_as_expected(event):
            message = handler.build_message_string(event)
            logger.info("Formatted by %s: %s", handler.__class__.__name__, message)
            publish_output(
                message,
                extra_email_recipients=handler.extra_email_recipients(event),
                subject=handler.email_subject(event),
            )
            return {"status": "ok", "handler": handler.__class__.__name__}

    logger.warning("No handler matched event: %s", event)
    return {"status": "no_match"}
