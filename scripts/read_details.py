#!/usr/bin/env python3
"""Read contest detail pages so most facts come from the crawl, not from a GPT worker.

ContestKorea and Wevity publish the period, organizer, audience, prize and home page on
each detail page. Both robots.txt files allow this. Values are portal text: an item that
reaches the brief is still confirmed against the organizer's own page.
"""

import html
import json
import re
import time
import urllib.error
import urllib.request

DETAIL_SOURCES = ("contestKorea", "wevity")
REQUEST_GAP_SECONDS = 0.3
USER_AGENT = "Mozilla/5.0 (compatible; daily-brief-crawler)"
FIELD_ALIASES = {
    "period": ("접수기간",),
    "host": ("주최/주관", "주최 . 주관", "주최.주관", "주최", "주관"),
    "target": ("응모대상", "참가대상"),
    "prize": ("1등 상금", "시상내역", "총 상금"),
    "homepage": ("홈페이지", "접수 홈페이지", "관련링크"),
}
ROW_PATTERNS = (
    re.compile(r'<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>', re.S),
    re.compile(r'<span class="tit">(.*?)</span>(.*?)</li>', re.S),
)
# ContestKorea keeps the organizer link in val2 and opens it by script.
HREF = re.compile(r'(?:href|val2)="(https?://[^"\s]+)')


def clean(value):
    text = html.unescape(re.sub(r"<[^>]+>", " ", value))
    return re.sub(r"\s+", " ", text).strip(" ,")


def parse_details(page):
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    rows = {}
    for pattern in ROW_PATTERNS:
        for label, value in pattern.findall(page):
            rows.setdefault(clean(label), value)
    details = {}
    for field, labels in FIELD_ALIASES.items():
        for label in labels:
            if label not in rows:
                continue
            value = rows[label]
            link = HREF.search(value)
            text = link.group(1) if field == "homepage" and link else clean(value)
            if text:
                details[field] = text[:300]
                break
    return details


def fetch_page(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", "replace")


def read_details(cache, fetch=fetch_page, gap_seconds=REQUEST_GAP_SECONDS):
    rows = []
    failed = 0
    for key, source in cache.get("sources", {}).items():
        for item in source.get("actionableItems") or []:
            row = {"source": key, "title": item.get("title"), "url": item.get("url"), "listing": item.get("rawText")}
            if key in DETAIL_SOURCES and item.get("url"):
                try:
                    row["details"] = parse_details(fetch(item["url"]))
                except (urllib.error.URLError, OSError, ValueError) as error:
                    row["detailError"] = str(error)[:200]
                    failed += 1
                time.sleep(gap_seconds)
            rows.append(row)
    return rows, failed


def write_details(root, today, cache, log):
    rows, failed = read_details(cache)
    path = root / f"artifacts/daily/{today}-details.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read = sum("details" in row for row in rows)
    log.event("details", items=len(rows), read=read, failed=failed)
    return {"detailsRead": read, "detailsFailed": failed}
