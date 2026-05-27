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
