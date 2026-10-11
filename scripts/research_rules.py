"""Shared source identity and risk-based verification rules for daily-brief.

This module has no filesystem or network side effects so the daily worklist
and the promotion gate can apply exactly the same rules.
"""

import re
from datetime import date, datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo


SEOUL = ZoneInfo("Asia/Seoul")
DATE_PATTERN = re.compile(r"(?<!\d)(?:(20\d{2})[.\-/])?(\d{1,2})[.\-/](\d{1,2})(?!\d)")
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid"}


def normalize_url(value):
    """Keep opportunity IDs encoded in query strings, ignore only known trackers."""
    parsed = urlsplit(value)
    path = parsed.path[:-1] if len(parsed.path) > 1 and parsed.path.endswith("/") else parsed.path
    query = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS
    ]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, urlencode(sorted(query)), ""))


def parse_seoul_date(value):
    """Interpret timestamps by their actual Asia/Seoul calendar date."""
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(SEOUL)
    return dt.date()


def _dates_in(text, today):
    matches = []
    for year_text, month_text, day_text in DATE_PATTERN.findall(text or ""):
        year, month, day = int(year_text or today.year), int(month_text), int(day_text)
        try:
            value = date(year, month, day)
        except ValueError:
            continue
        # An unqualified January date in late December commonly refers to
        # the upcoming year. Do NOT roll arbitrary expired dates a year ahead.
        if not year_text and today.month == 12 and month == 1:
            value = date(today.year + 1, month, day)
        matches.append(value)
    return matches


def nearest_deadline_date(item, today):
    """Prefer explicitly advertised deadlines, not unrelated event/start dates."""
    deadline_dates = _dates_in(str(item.get("deadlineText") or ""), today)
    if not deadline_dates:
        period = str(item.get("period") or "")
        if re.search(r"접수|모집|신청|응모|등록|제출|마감", period):
            period_dates = _dates_in(period, today)
            # Periods commonly list application start then end.
            deadline_dates = [max(period_dates)] if period_dates else []
    if not deadline_dates:
        return None
    upcoming = [d for d in deadline_dates if d >= today]
    return min(upcoming) if upcoming else max(deadline_dates)


def is_reverification_due(item, snapshot_date):
    today = date.fromisoformat(snapshot_date)
    last = parse_seoul_date(item.get("lastVerifiedDate"))
    if last is None:
        return True

    if item.get("status") == "UPCOMING":
        opening = parse_seoul_date(item.get("openingAt"))
        interval_days = 1 if opening and opening <= today + timedelta(days=1) else 2
    else:
        deadline = nearest_deadline_date(item, today)
        days_left = (deadline - today).days if deadline else None
        if days_left is not None and days_left <= 3:
            interval_days = 1
        elif days_left is not None and days_left <= 14:
            interval_days = 2
        else:
            interval_days = 7
    return (today - last).days >= interval_days
