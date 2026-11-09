"""Shared source identity and risk-based verification rules for daily-brief.

This module has no filesystem or network side effects so the daily worklist
and the promotion gate can apply exactly the same rules.
"""

import re
from datetime import date, datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo


SEOUL = ZoneInfo("Asia/Seoul")
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid"}
OUT_OF_SCOPE_HOSTS = {"devpost.com"}
ROLLING_LABELS = ("상시", "수시", "예산 소진 시", "선착순")
UNKNOWN_DEADLINE = "확인 필요"
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


def deadline_info(item):
    """Read the writer's structured deadline (decisions in docs/archive/review-2026-11-06-dday.md and
    review-2026-11-09-dday-implementation.md). The code never guesses a deadline from prose.

    DATE: list of YYYY-MM-DD application deadlines; open until the last one passes.
    ROLLING: one of ROLLING_LABELS, no fixed deadline.
    UNKNOWN: "확인 필요" or missing; kept off the open lists until confirmed.
    INVALID: anything else; validate_data.py refuses it.
    """
    value = item.get("deadline")
    if value is None or value == UNKNOWN_DEADLINE:
        return {"kind": "UNKNOWN"}
    if value in ROLLING_LABELS:
        return {"kind": "ROLLING", "label": value}
    if isinstance(value, list) and value and all(isinstance(entry, str) and ISO_DATE.match(entry) for entry in value):
        try:
            return {"kind": "DATE", "dates": sorted({date.fromisoformat(entry) for entry in value})}
        except ValueError:
            pass
    return {"kind": "INVALID"}


def deadline_label(info, today):
    if info["kind"] == "ROLLING":
        return info["label"]
    if info["kind"] != "DATE":
        return "마감 확인 필요"
    upcoming = [value for value in info["dates"] if value >= today]
    if not upcoming:
        return "마감"
    days = (min(upcoming) - today).days
    return "오늘 마감" if days == 0 else f"D-{days}"


def nearest_deadline_date(item, today):
    """The next application deadline, or the last one once all have passed."""
    info = deadline_info(item)
    if info["kind"] != "DATE":
        return None
    upcoming = [value for value in info["dates"] if value >= today]
    return min(upcoming) if upcoming else max(info["dates"])


def all_deadlines_passed(item, today):
    info = deadline_info(item)
    return info["kind"] == "DATE" and max(info["dates"]) < today


def is_out_of_scope(item):
    """Overseas hosts no longer collected; their items stay as history."""
    for link in item.get("links") or []:
        host = (urlsplit(str(link.get("url") or "")).hostname or "").lower()
        if any(host == name or host.endswith(f".{name}") for name in OUT_OF_SCOPE_HOSTS):
            return True
    return False


def can_close_without_verification(previous, current, today):
    if previous.get("status") not in ("OPEN", "UPCOMING") or current.get("status") != "CLOSED":
        return False
    if is_out_of_scope(previous):
        return all_deadlines_passed(previous, today)
    # apply_deadlines closed it today because every stated deadline has passed.
    return current.get("autoClosedDate") == today.isoformat() and all_deadlines_passed(current, today)


def apply_deadlines(snapshot, snapshot_date):
    """Write dDay from the structured deadline and close OPEN items whose deadlines all passed.

    The site recomputes D-day from `deadline` on the reader's day, so a missed
    publish no longer leaves a frozen D-day (review-2026-11-06-dday.md, A and B).
    """
    today = date.fromisoformat(snapshot_date)
    closed = []
    for group in ("contests", "support"):
        for item in snapshot.get(group, []):
            # Items written before the field existed keep their text until a researcher fills `deadline`.
            if item.get("status") != "OPEN" or "deadline" not in item:
                continue
            info = deadline_info(item)
            item.pop("autoClosedDate", None)
            if info["kind"] == "DATE" and max(info["dates"]) < today:
                item["status"] = "CLOSED"
                item["autoClosedDate"] = snapshot_date
                item["lastUpdatedDate"] = snapshot_date
                closed.append(item["id"])
            else:
                item["dDay"] = deadline_label(info, today)
    return closed


def close_expired_out_of_scope(snapshot, snapshot_date):
    today = date.fromisoformat(snapshot_date)
    closed = []
    for group in ("contests", "support"):
        for item in snapshot.get(group, []):
            if (
                item.get("status") in ("OPEN", "UPCOMING")
                and is_out_of_scope(item)
                and all_deadlines_passed(item, today)
            ):
                item["status"] = "CLOSED"
                item["lastUpdatedDate"] = snapshot_date
                closed.append(item["id"])
    return closed


def is_reverification_due(item, snapshot_date):
    if is_out_of_scope(item):
        return False
    today = date.fromisoformat(snapshot_date)
    # publish closes it by date (apply_deadlines); an official check would change nothing.
    if item.get("status") == "OPEN" and all_deadlines_passed(item, today):
        return False
    last = parse_seoul_date(item.get("lastVerifiedDate"))
    if last is None:
        return True
    # Published from portal data before the organizer's page was read: check again every day.
    if item.get("officialCheck") == "PENDING":
        return (today - last).days >= 1

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
