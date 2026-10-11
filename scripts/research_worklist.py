#!/usr/bin/env python3
"""Read-only, repeatable daily research worklist; NOT a research audit.

No entries from this report count as executed searches or official verification.
Operators must perform every check and record actual evidence separately.
"""

import argparse
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from research_rules import is_reverification_due


ROOT = Path(__file__).resolve().parents[1]


def build_worklist(snapshot_date, root=ROOT):
    baseline = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "data/crawler-sources.json").read_text(encoding="utf-8"))
    path = root / f"data/source-cache/{snapshot_date}.json"
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    valid = bool(
        cache
        and cache.get("date") == snapshot_date
        and cache.get("crawler", {}).get("engine") == "playwright-chromium"
    )
    due = [
        {
            "id": item["id"],
            "title": item.get("title"),
            "status": item["status"],
            "lastVerifiedDate": item.get("lastVerifiedDate"),
            "deadlineText": item.get("deadlineText"),
            "openingAt": item.get("openingAt"),
        }
        for group in ("contests", "support")
        for item in baseline.get(group, [])
        if item.get("id")
        and item.get("status") in ("OPEN", "UPCOMING")
        and is_reverification_due(item, snapshot_date)
    ]
    sources = {}
    required_failures = []
    if valid:
        for entry in manifest.get("active", []):
            key = entry["key"]
            result = cache.get("sources", {}).get(key, {})
            ok = result.get("status") == "OK" and (
                not entry.get("required") or (result.get("items") and result.get("actionableItems") is not None)
            )
            if entry.get("required") and not ok:
                required_failures.append(key)
            sources[key] = {
                "status": result.get("status", "MISSING"),
                "required": bool(entry.get("required")),
                "actionableItems": result.get("actionableItems", []) if ok else [],
                "sourceGap": result.get("status") != "OK",
            }
    return {
        "date": snapshot_date,
        "baselineDate": baseline.get("date"),
        "cachePresentAndCurrent": valid,
        "requiredFailures": required_failures,
        "reverificationDue": due,
        "activeSources": sources,
        "shadowSources": {
            key: {"status": val.get("status"), "actionableCount": len(val.get("actionableItems", []))}
            for key, val in (cache or {}).get("shadowSources", {}).items()
        },
        "note": "WORKLIST ONLY: no searches, URL reviews, or official re-verifications are claimed.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat())
    parser.add_argument("--json", action="store_true", help="Print complete URL-by-URL worklist")
    args = parser.parse_args()
    worklist = build_worklist(args.date)
    if args.json:
        print(json.dumps(worklist, ensure_ascii=False, indent=2))
    else:
        print(f"{worklist['date']}: baseline={worklist['baselineDate']} cache={worklist['cachePresentAndCurrent']}")
        print(f"required crawler failures: {worklist['requiredFailures']}")
        print(f"due re-verifications: {len(worklist['reverificationDue'])}")
        for item in worklist["reverificationDue"]:
            print(f"  {item['id']}: {item['title']}")
        for key, result in worklist["activeSources"].items():
            print(f"  {key}: {result['status']}, {len(result['actionableItems'])} actionable, gap={result['sourceGap']}")
        print(worklist["note"])


if __name__ == "__main__":
    main()
