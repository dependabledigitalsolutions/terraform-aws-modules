"""Base class for event handlers.

A handler decides whether it can interpret the event Lambda just received,
and if so, formats it as a plain text/Markdown string the output utils can
forward to whichever destination is enabled (Slack / Teams / Chime / SES).

New event types are added by writing another EventHandler subclass and
appending it to the HANDLERS list in alerting.py.
"""


class EventHandler:
    def is_event_as_expected(self, event):
        """Return True if this handler can format the given event."""
        raise NotImplementedError

    def build_message_string(self, event):
        """Return a multi-line string describing the event."""
        raise NotImplementedError

    def extra_email_recipients(self, event):
        """Additional SES recipients for this specific event, on top of any
        static `ses_recipients` configured on the module. Default: none.
        Override when the event's payload names specific opted-in users."""
        return []

    def email_subject(self, event):
        """Subject line for SES delivery of this event. Override for
        application-domain events where a generic subject is unhelpful."""
        return "AWS account alert"
