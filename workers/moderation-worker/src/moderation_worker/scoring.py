from __future__ import annotations

from dataclasses import dataclass

from .models import SafetyAppeal, SafetyReport


HIGH_SEVERITY_KEYWORDS = {
    "threat",
    "violence",
    "self-harm",
    "suicide",
    "sexual abuse",
    "extortion",
    "doxx",
    "terror",
}

SPAM_KEYWORDS = {
    "buy now",
    "free crypto",
    "airdrop",
    "limited offer",
    "click here",
    "promo code",
    "investment guarantee",
    "double your money",
}

APPEAL_ACCEPT_HINTS = {
    "mistake",
    "false positive",
    "wrong account",
    "misunderstanding",
    "sorry",
}

APPEAL_REJECT_HINTS = {
    "i will do it again",
    "no regret",
    "you can't stop me",
}


@dataclass(frozen=True)
class ReportDecision:
    status: str
    score: int
    note: str


def _keyword_hits(text: str, keywords: set[str]) -> int:
    lowered = text.lower()
    return sum(1 for keyword in keywords if keyword in lowered)


def _combined_report_text(report: SafetyReport) -> str:
    parts = [report.reason_code.strip().lower()]
    if report.details:
        parts.append(report.details.strip().lower())
    return " | ".join(part for part in parts if part)


def triage_report(report: SafetyReport) -> ReportDecision:
    text = _combined_report_text(report)
    high_hits = _keyword_hits(text, HIGH_SEVERITY_KEYWORDS)
    spam_hits = _keyword_hits(text, SPAM_KEYWORDS)

    score = 20
    if report.reason_code in {"phishing", "scam", "spam"}:
        score += 35
    if report.reason_code in {"harassment", "hate_speech", "threat"}:
        score += 40

    score += high_hits * 20
    score += spam_hits * 15
    score = min(score, 100)

    status = "in_review"
    if report.reason_code in {"spam", "scam", "phishing"} and score >= 85:
        status = "resolved"

    note = (
        f"[moderation-worker] triage score={score}; "
        f"highSeverityHits={high_hits}; spamSignals={spam_hits}; "
        f"recommendedStatus={status}."
    )

    return ReportDecision(status=status, score=score, note=note)


def triage_appeal_note(appeal: SafetyAppeal) -> str:
    text = appeal.body.strip().lower()
    accept_hits = _keyword_hits(text, APPEAL_ACCEPT_HINTS)
    reject_hits = _keyword_hits(text, APPEAL_REJECT_HINTS)

    recommendation = "manual_review"
    if accept_hits > reject_hits:
        recommendation = "consider_accept"
    elif reject_hits > accept_hits:
        recommendation = "consider_reject"

    return (
        f"[moderation-worker] appeal triage acceptSignals={accept_hits}; "
        f"rejectSignals={reject_hits}; recommendedAction={recommendation}."
    )
