"""Unit tests for the ops-alerting handler chain.

Tests are run by CI via `python -m unittest discover` from the
`modules/ops-alerting/src/alerting` directory, so that the bare
`from handlers.* import ...` lines in the Lambda code resolve the same
way they do at runtime in the Lambda zip.
"""

import json
import unittest

from handlers.cloudwatch_alarms import CloudWatchAlarmHandler
from handlers.guardduty import GuarddutyFindingHandler
from handlers.product_event import ProductEventHandler
from handlers.sns_passthrough import SnsPassthroughHandler


def sns_wrap(message_obj_or_str, subject=None):
    """Wrap a payload as if it had been published to the alerting topic."""
    message = (
        message_obj_or_str
        if isinstance(message_obj_or_str, str)
        else json.dumps(message_obj_or_str)
    )
    return {"Records": [{"Sns": {"Message": message, "Subject": subject}}]}


class ProductEventHandlerTests(unittest.TestCase):
    def _eb_event(self, detail_type="complaint.created", detail=None):
        return sns_wrap({
            "version": "0",
            "id": "evt-1",
            "detail-type": detail_type,
            "source": "tasty-erp",
            "account": "088070740412",
            "time": "2026-05-27T12:00:00Z",
            "region": "eu-west-1",
            "detail": detail or {},
        })

    def test_matches_eventbridge_via_sns(self):
        event = self._eb_event(detail={"title": "Hi"})
        self.assertTrue(ProductEventHandler().is_event_as_expected(event))

    def test_does_not_match_plain_sns_string(self):
        event = sns_wrap("a plain string body")
        self.assertFalse(ProductEventHandler().is_event_as_expected(event))

    def test_does_not_match_cloudwatch_alarm_payload(self):
        # Confirms we don't steal the CloudWatchAlarmHandler's events.
        event = sns_wrap({
            "AlarmName": "dds-billing-alarm",
            "NewStateValue": "ALARM",
            "AlarmDescription": "Estimated charges > $5",
            "NewStateReason": "...",
            "StateChangeTime": "2026-05-27T12:00:00Z",
            "AWSAccountId": "088070740412",
            "Region": "us-east-1",
        })
        self.assertFalse(ProductEventHandler().is_event_as_expected(event))

    def test_message_uses_title_body_and_link(self):
        event = self._eb_event(detail={
            "title": "New high complaint at Woolwich Branch",
            "body": "Foreign object found in jollof rice",
            "link_path": "https://tastyerp.poc.dependabledigitalsolutions.com/complaints/abc",
            "severity": "high",
            "branchId": "branch-1",
            "notify_channels": ["slack"],
        })
        msg = ProductEventHandler().build_message_string(event)
        self.assertIn("🔔", msg)
        self.assertIn("New high complaint at Woolwich Branch", msg)
        self.assertIn("Foreign object found in jollof rice", msg)
        # Absolute URL gets rendered as a Slack-clickable link
        self.assertIn(
            "<https://tastyerp.poc.dependabledigitalsolutions.com/complaints/abc|Open>",
            msg,
        )
        # Extras footer surfaces non-reserved detail fields
        self.assertIn("severity:", msg)
        self.assertIn("high", msg)
        # Reserved keys must NOT be repeated in the footer
        self.assertNotIn("notify_channels:", msg)
        self.assertNotIn("link_path:", msg)
        self.assertNotIn("body:", msg)

    def test_relative_link_renders_as_text_not_slack_link(self):
        event = self._eb_event(detail={"title": "x", "link_path": "/complaints/abc"})
        msg = ProductEventHandler().build_message_string(event)
        self.assertIn("*Link:* /complaints/abc", msg)
        self.assertNotIn("<https://", msg)

    def test_falls_back_to_detail_type_when_no_title(self):
        event = self._eb_event(detail_type="refund.status_changed", detail={})
        msg = ProductEventHandler().build_message_string(event)
        # Header line carries the detail-type as the headline
        self.assertIn("*refund.status_changed*", msg)
        # And shows the source/detail-type footer line
        self.assertIn("tasty-erp / refund.status_changed", msg)

    def test_long_body_is_truncated(self):
        long_body = "x" * 1000
        event = self._eb_event(detail={"title": "t", "body": long_body})
        msg = ProductEventHandler().build_message_string(event)
        self.assertLess(len(msg), 1200)
        self.assertIn("…", msg)

    def test_extra_email_recipients_returns_notify_emails_when_channel_set(self):
        event = self._eb_event(detail={
            "title": "x",
            "notify_channels": ["slack", "email"],
            "notify_emails": ["a@example.com", "b@example.com"],
        })
        self.assertEqual(
            ProductEventHandler().extra_email_recipients(event),
            ["a@example.com", "b@example.com"],
        )

    def test_extra_email_recipients_ignored_when_channel_missing(self):
        # Producer sent the emails but forgot the channel flag — opt-out.
        event = self._eb_event(detail={
            "title": "x",
            "notify_channels": ["slack"],
            "notify_emails": ["a@example.com"],
        })
        self.assertEqual(ProductEventHandler().extra_email_recipients(event), [])

    def test_extra_email_recipients_filters_bad_addresses(self):
        event = self._eb_event(detail={
            "title": "x",
            "notify_channels": ["email"],
            "notify_emails": ["good@example.com", "", "not-an-email", None, "ok@x.io"],
        })
        self.assertEqual(
            ProductEventHandler().extra_email_recipients(event),
            ["good@example.com", "ok@x.io"],
        )

    def test_email_subject_falls_back_to_detail_type_then_default(self):
        # With title
        with_title = self._eb_event(detail={"title": "Refund approved"})
        self.assertEqual(ProductEventHandler().email_subject(with_title), "Refund approved")
        # Without title — detail-type takes over
        no_title = self._eb_event(detail_type="custom.thing", detail={})
        self.assertEqual(ProductEventHandler().email_subject(no_title), "custom.thing")


class PublishToSesTests(unittest.TestCase):
    """Recipient-merge and gating logic in output_utils.publish_to_ses,
    without making real SES calls — boto3.client is monkey-patched."""

    def setUp(self):
        import boto3
        self._real_client = boto3.client
        self.sent = []
        def fake_client(name, *a, **kw):
            if name != "ses":
                return self._real_client(name, *a, **kw)
            outer = self
            class FakeSes:
                def send_email(self, **kwargs):
                    outer.sent.append(kwargs)
                    return {"MessageId": f"msg-{len(outer.sent)}"}
            return FakeSes()
        boto3.client = fake_client

        # Reset env per test
        import os
        for k in ["enable_ses_email_output", "ses_sender_email", "email_recipients"]:
            os.environ.pop(k, None)

    def tearDown(self):
        import boto3
        boto3.client = self._real_client

    def test_disabled_when_env_flag_off(self):
        from output_utils import publish_to_ses
        publish_to_ses("hi", extra_recipients=["x@example.com"])
        self.assertEqual(self.sent, [])

    def test_disabled_when_sender_unset_even_with_extras(self):
        import os
        os.environ["enable_ses_email_output"] = "true"
        from output_utils import publish_to_ses
        publish_to_ses("hi", extra_recipients=["x@example.com"])
        self.assertEqual(self.sent, [])

    def test_no_send_when_no_recipients_anywhere(self):
        import os
        os.environ["enable_ses_email_output"] = "true"
        os.environ["ses_sender_email"] = "noreply@example.com"
        from output_utils import publish_to_ses
        publish_to_ses("hi", extra_recipients=[])
        self.assertEqual(self.sent, [])

    def test_per_event_recipients_only(self):
        import os
        os.environ["enable_ses_email_output"] = "true"
        os.environ["ses_sender_email"] = "noreply@example.com"
        from output_utils import publish_to_ses
        publish_to_ses("body", extra_recipients=["a@x.com", "b@x.com"], subject="Hello")
        self.assertEqual(len(self.sent), 2)
        self.assertEqual(
            sorted(s["Destination"]["ToAddresses"][0] for s in self.sent),
            ["a@x.com", "b@x.com"],
        )
        self.assertEqual(self.sent[0]["Message"]["Subject"]["Data"], "Hello")

    def test_static_plus_extras_deduped(self):
        import os
        os.environ["enable_ses_email_output"] = "true"
        os.environ["ses_sender_email"] = "noreply@example.com"
        os.environ["email_recipients"] = "ops@x.com, a@x.com"
        from output_utils import publish_to_ses
        publish_to_ses("body", extra_recipients=["a@x.com", "b@x.com"])
        addrs = [s["Destination"]["ToAddresses"][0] for s in self.sent]
        self.assertEqual(addrs, ["ops@x.com", "a@x.com", "b@x.com"])


class HandlerChainOrderTests(unittest.TestCase):
    """Belt-and-braces: make sure each handler is only triggered by its
    own kind of event, even when they share the SNS envelope."""

    def test_cloudwatch_alarm_handler_still_wins_its_own_events(self):
        event = sns_wrap({
            "AlarmName": "dds-billing-alarm",
            "NewStateValue": "OK",
            "AlarmDescription": "d",
            "NewStateReason": "r",
            "StateChangeTime": "t",
            "AWSAccountId": "a",
            "Region": "r",
        })
        self.assertTrue(CloudWatchAlarmHandler().is_event_as_expected(event))
        self.assertFalse(ProductEventHandler().is_event_as_expected(event))

    def test_guardduty_handler_unaffected(self):
        event = {"Finding_Type": "Recon:EC2/Portscan", "Account_Id": "a", "region": "r"}
        self.assertTrue(GuarddutyFindingHandler().is_event_as_expected(event))
        self.assertFalse(ProductEventHandler().is_event_as_expected(event))

    def test_passthrough_still_catches_free_text(self):
        event = sns_wrap("hello world")
        self.assertTrue(SnsPassthroughHandler().is_event_as_expected(event))


if __name__ == "__main__":
    unittest.main()
