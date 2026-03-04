from __future__ import annotations

import unittest

from moderation_worker.models import SafetyAppeal, SafetyReport
from moderation_worker.scoring import triage_appeal_note, triage_report


class ScoringTests(unittest.TestCase):
    def test_spam_reports_can_auto_resolve(self) -> None:
        report = SafetyReport(
            id="rpt_1",
            target_type="message",
            reason_code="spam",
            details="Limited offer! click here for free crypto airdrop now",
            status="open",
            resolution_note=None,
        )

        decision = triage_report(report)
        self.assertEqual(decision.status, "resolved")
        self.assertGreaterEqual(decision.score, 85)

    def test_non_spam_reports_move_to_in_review(self) -> None:
        report = SafetyReport(
            id="rpt_2",
            target_type="user",
            reason_code="harassment",
            details="Repeated personal threats in chat.",
            status="open",
            resolution_note=None,
        )

        decision = triage_report(report)
        self.assertEqual(decision.status, "in_review")
        self.assertIn("triage score=", decision.note)

    def test_appeal_note_contains_recommendation(self) -> None:
        appeal = SafetyAppeal(
            id="apl_1",
            report_id="rpt_1",
            body="This was a misunderstanding and a false positive.",
            status="open",
            resolution_note=None,
        )

        note = triage_appeal_note(appeal)
        self.assertIn("recommendedAction=", note)


if __name__ == "__main__":
    unittest.main()
