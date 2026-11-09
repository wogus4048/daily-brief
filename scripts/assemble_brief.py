#!/usr/bin/env python3
"""Build today's latest.json, dated archive and research audit from the GPT stage results.

Input: artifacts/daily/DATE-gpt.json written by daily_run.py (find, news, candidates, check,
reverify). Facts come only from GPT answers and the crawl; a record GPT did not return is
written as FAILED with its reason, never filled in (design 2026-11-09, user decision 2).
"""

import json
import re
from datetime import date
from urllib.parse import urlsplit

from gpt_jobs import DISTRICTS, FIXED_SOURCES, TRACK_AXES, clean_title, now_iso
from research_rules import deadline_info, normalize_url

OPPORTUNITY_TRACKS = ("aiData", "generalSoftware", "publicIdea", "startupSupport", "upcomingOpenings")
MIN_CANDIDATES = {"aiData": 10, "generalSoftware": 15, "publicIdea": 10, "startupSupport": 15}
DISPOSITIONS = {"PUBLISHED", "EXISTING", "DUPLICATE", "INELIGIBLE", "CLOSED", "NOT_RELEVANT"}
# A RETRY reason marks a lead nobody could judge today; free_explore.earlier_decisions skips it.
RETRY = "RETRY: "
CHANGE_FIELDS = {"status", "deadline", "deadlineText", "period", "participation", "reward", "openingAt"}
DISCOVERY_ENUMS = {
    "discoveryType": {"site", "github", "skill", "mcp", "agent", "workflow", "directory", "discussion", "platform"},
    "awareness": {"WELL_KNOWN", "SPECIALIZED", "EARLY"},
    "trend": {"HOT", "RISING", "STEADY", "RESURFACED"},
    "newsState": {"NEW_RELEASE", "NEWLY_DISCOVERED", "UPDATED", "BASELINE"},
}


class AssembleFailed(Exception):
    pass


def valid_url(value):
    parts = urlsplit(str(value or ""))
    return parts.scheme in ("http", "https") and "." in (parts.hostname or "")


def slug(value, taken):
    base = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:70] or "item"
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    taken.add(candidate)
    return candidate


def first_link(item):
    return next((l["url"] for l in item.get("links", []) if valid_url(l.get("url"))), None)


def opportunity_card(raw, candidate, official, today, taken):
    """GPT card -> site card. Returns (group, card) or raises ValueError with the reason."""
    if not isinstance(raw, dict) or not raw.get("title") or not raw.get("summary"):
        raise ValueError("카드에 title·summary가 없음")
    card = {k: v for k, v in raw.items() if k not in ("dDay", "autoClosedDate", "track")}
    card["id"] = slug(raw.get("id") or raw["title"], taken)
    links = [l for l in card.get("links") or [] if isinstance(l, dict) and valid_url(l.get("url"))]
    if not links:
        links = [{"label": "공고", "url": candidate["url"]}]
    card["links"] = links
    if deadline_info(card)["kind"] == "INVALID":
        card["deadline"] = "확인 필요"
    if card.get("status") != "UPCOMING" or not card.get("openingAt"):
        card["status"] = "OPEN"
    for field in ("firstSeenDate", "lastUpdatedDate", "lastVerifiedDate"):
        card[field] = today
    if not official:
        card["officialCheck"] = "PENDING"
    label = str(card.get("categoryLabel") or "")
    group = "support" if label.startswith("창업 · 지원") else "contests"
    return group, card


def news_card(raw, kind, today, taken):
    if not isinstance(raw, dict) or not raw.get("title") or not raw.get("summary"):
        raise ValueError("카드에 title·summary가 없음")
    links = [l for l in raw.get("links") or [] if isinstance(l, dict) and valid_url(l.get("url"))]
    if not links:
        raise ValueError("확인 링크가 없음")
    evidence = {k: raw.get(k) for k in ("communityEvidence", "verificationUrls", "verificationNote") if raw.get(k)}
    card = {k: v for k, v in raw.items() if k not in evidence}
    card.update(id=slug(raw.get("id") or raw["title"], taken), links=links, firstSeenDate=today, lastUpdatedDate=today)
    if kind == "aiNews":
        card.setdefault("categoryLabel", "AI 뉴스")
        card["updatedAgo"] = "오늘"
        card["updates"] = [{"date": today, "label": "처음 발견", "text": card["summary"]}]
    else:
        for field, allowed in DISCOVERY_ENUMS.items():
            if card.get(field) not in allowed:
                raise ValueError(f"{field} 값이 허용 목록에 없음: {card.get(field)!r}")
    return card, evidence


def record(rows, kind, key_field, names, label):
    """fixedSources/districts: GPT's line for each name, or FAILED when it sent none."""
    got = {r.get(key_field): r for r in rows if r.get("kind") == kind}
    out = {}
    for name in names:
        row = got.get(name)
        if row and row.get("status") in ("CHECKED", "FAILED"):
            urls = [u for u in row.get("urls") or [] if valid_url(u)]
            entry = {"status": row["status"] if urls else "FAILED", "urls": urls,
                     "coverageNote": str(row.get("note") or "")}
            if entry["status"] == "FAILED":
                entry["reason"] = str(row.get("note") or "") or "GPT가 연 주소를 적지 않음"
        else:
            entry = {"status": "FAILED", "urls": [], "reason": f"GPT 답에 {label} 기록이 없음"}
        out[name] = entry
    return out


def assemble(root, today):
    state = json.loads((root / f"artifacts/daily/{today}-gpt.json").read_text(encoding="utf-8"))
    latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
    cache = json.loads((root / f"data/source-cache/{today}.json").read_text(encoding="utf-8"))
    find_rows = state.get("find", {}).get("rows", [])
    news_rows = state.get("news", {}).get("rows", [])
    candidates = state.get("candidates", [])
    decided = state.get("decided", [])
    check = state.get("check", {}).get("answers", {})
    reverify = state.get("reverify", {})
    due = state.get("due", [])
    checked_at = reverify.get("checkedAt") or now_iso()
    taken = {x["id"] for g in ("contests", "support", "aiNews", "aiDiscovery") for x in latest.get(g, [])}
    by_id = {x["id"]: x for g in ("contests", "support") for x in latest[g]}

    # 1. Re-verification of existing items.
    reverified, evidence, failures = [], [], []
    for position, item_id in enumerate(due):
        item = by_id[item_id]
        answer = reverify.get("answers", {}).get(str(position))
        stored = first_link(item) or "https://example.invalid/"
        if answer and answer.get("result") == "VERIFIED":
            url = answer.get("primarySourceUrl") if valid_url(answer.get("primarySourceUrl")) else stored
            reverified.append(item_id)
            evidence.append({"id": item_id, "primarySourceUrl": url, "verifiedAt": checked_at,
                             "verificationNote": str(answer.get("note") or "GPT worker 공식 페이지 확인")})
            item["lastVerifiedDate"] = today
            item.pop("officialCheck", None)
            changes = {k: v for k, v in (answer.get("changes") or {}).items() if k in CHANGE_FIELDS}
            if changes.get("status") not in (None, "OPEN", "CLOSED", "UPCOMING"):
                changes.pop("status")
            if "deadline" in changes and deadline_info(changes)["kind"] == "INVALID":
                changes.pop("deadline")
            if changes:
                item.update(changes)
                item["lastUpdatedDate"] = today
        else:
            reason = str((answer or {}).get("note") or "") or "GPT worker 답 없음"
            url = (answer or {}).get("primarySourceUrl")
            failures.append({"id": item_id, "primarySourceUrl": url if valid_url(url) else stored, "reason": reason})

    # 2. New candidates: dispositions and cards.
    new_cards = {"contests": [], "support": []}
    disposition_by_url = {}
    track_entries = {t: [] for t in TRACK_AXES}
    for position, candidate in enumerate(candidates):
        answer = check.get(str(position))
        entry = {"title": clean_title(candidate["title"]), "url": candidate["url"]}
        track = (answer or {}).get("track") or candidate.get("track")
        if track not in OPPORTUNITY_TRACKS:
            track = "startupSupport" if "startup" in str(candidate.get("source")).lower() else "publicIdea"
        if not answer or answer.get("disposition") not in DISPOSITIONS:
            entry.update(disposition="NOT_RELEVANT", reason=RETRY + "GPT 답 없음")
        elif answer["disposition"] == "PUBLISHED":
            try:
                group, card = opportunity_card(answer.get("card"), candidate, answer.get("official") is not False,
                                               today, taken)
                new_cards[group].append(card)
                entry.update(disposition="PUBLISHED", id=card["id"])
            except ValueError as error:
                entry.update(disposition="NOT_RELEVANT", reason=RETRY + f"카드 형식 오류: {error}")
        else:
            entry.update(disposition=answer["disposition"],
                         reason=str(answer.get("reason") or answer["disposition"]))
            if answer.get("id") in by_id:
                entry["id"] = answer["id"]
        disposition_by_url[normalize_url(candidate["url"])] = entry
        # Crawl rows are listed in machineSources; a published one must also sit in a track.
        if str(candidate.get("source", "")).startswith("gpt-") or entry["disposition"] == "PUBLISHED":
            track_entries[track].append(entry)
    for item in decided:
        entry = {"title": clean_title(item["title"]), "url": item["url"], "disposition": item["disposition"],
                 "reason": item.get("reason") or item["disposition"]}
        if item.get("id"):
            entry["id"] = item["id"]
        disposition_by_url.setdefault(normalize_url(item["url"]), entry)
        if str(item.get("source", "")).startswith("gpt-") and item.get("track") in OPPORTUNITY_TRACKS:
            track_entries[item["track"]].append(entry)

    # 3. Crawl inventories: every actionable crawl URL has a disposition.
    machine, inventories = {}, {"daconCompetitions": [], "dakerHackathons": []}
    for key, source in cache.get("sources", {}).items():
        if source.get("status") == "FAILED":
            continue
        rows = []
        for item in source.get("actionableItems") or []:
            if not item.get("url"):
                continue
            found = disposition_by_url.get(normalize_url(item["url"]))
            rows.append({**(found or {"disposition": "NOT_RELEVANT", "reason": RETRY + "처분 기록 없음"}),
                         "title": item.get("title") or item["url"], "url": item["url"]})
        (inventories if key in inventories else machine)[key] = rows

    # 4. News.
    news_cards = {"aiNews": [], "aiDiscovery": []}
    for row in news_rows:
        kind = row.get("kind")
        if kind in ("aiNews", "aiDiscovery"):
            try:
                card, proof = news_card(row.get("card"), kind, today, taken)
            except ValueError as error:
                raw = row.get("card") if isinstance(row.get("card"), dict) else {}
                track_entries[kind].append({"title": raw.get("title") or "제목 없음", "url": first_link(raw) or "https://news.ycombinator.com/",
                                            "disposition": "NOT_RELEVANT", "reason": f"카드 형식 오류: {error}"})
                continue
            news_cards[kind].append(card)
            track_entries[kind].append({"title": card["title"], "url": card["links"][0]["url"], "disposition": "PUBLISHED",
                                        "id": card["id"], **proof, "observedAt": now_iso()})
        elif kind == "candidate" and row.get("track") in ("aiNews", "aiDiscovery") and row.get("disposition") != "PUBLISHED":
            if row.get("title") and valid_url(row.get("url")):
                track_entries[row["track"]].append({"title": row["title"], "url": row["url"],
                                                    "disposition": row.get("disposition") if row.get("disposition") in DISPOSITIONS else "NOT_RELEVANT",
                                                    "reason": str(row.get("reason") or "고르지 않음")})

    # 5. Tracks.
    all_rows = find_rows + news_rows
    tracks = {}
    for track, axes in TRACK_AXES.items():
        queries = {axis: [] for axis in axes}
        for row in all_rows:
            if row.get("kind") == "queries" and row.get("track") == track and row.get("axis") in queries:
                queries[row["axis"]] += [q for q in row.get("queries") or [] if isinstance(q, str) and q.strip()]
        thin = [axis for axis, qs in queries.items() if len({q.lower().strip() for q in qs}) < 2]
        entries = track_entries[track]
        if thin:
            status = {"status": "FAILED", "failureReason": f"GPT가 검색어 2개 이상을 적지 않은 축: {', '.join(thin)}"}
        elif len(entries) < MIN_CANDIDATES.get(track, 0):
            status = {"status": "EXHAUSTED",
                      "exhaustedReason": f"GPT worker 찾기에서 이 트랙 후보 {len(entries)}건이 나왔다(기준 {MIN_CANDIDATES[track]}건)."}
        else:
            status = {"status": "DONE"}
        tracks[track] = {**status, "queriesByAxis": queries, "rawCandidates": entries}

    # 6. Fixed sources, districts, annual contests, new listing pages.
    fixed = record(find_rows, "fixedSource", "name", list(FIXED_SOURCES), "고정 출처")
    fixed["DACON"] = {"status": "CHECKED", "urls": ["https://www.dacon.io/competitions", "https://daker.ai/public/hackathons"],
                      "coverageNote": "Playwright 크롤러 캐시로 DACON과 DAKER 목록을 읽었다.",
                      "competitionsInventory": inventories["daconCompetitions"], "dakerInventory": inventories["dakerHackathons"]}
    districts = record(find_rows, "district", "key", list(DISTRICTS), "구청")
    annual = [r for r in find_rows if r.get("kind") == "annual"]
    discoveries = [{"url": r["url"], "listUrl": r["url"], "name": r.get("name") or r["url"],
                    "reason": r.get("reason") or "GPT worker가 찾은 목록 페이지"}
                   for r in find_rows if r.get("kind") == "listingPage" and valid_url(r.get("url"))]

    # 7. Files.
    stamp = now_iso()
    latest["date"] = today
    latest["generatedAt"] = stamp
    latest["contests"] = new_cards["contests"] + latest["contests"]
    latest["support"] = new_cards["support"] + latest["support"]
    latest["aiNews"] = news_cards["aiNews"] + latest["aiNews"]
    latest["aiDiscovery"] = news_cards["aiDiscovery"] + latest["aiDiscovery"]
    if today not in latest["archive"]:
        latest["archive"].insert(0, today)
    blob = (json.dumps(latest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (root / "data/latest.json").write_bytes(blob)
    (root / f"data/archive/{today}.json").write_bytes(blob)
    published = [c["id"] for g in ("contests", "support") for c in new_cards[g]] + \
                [c["id"] for g in ("aiNews", "aiDiscovery") for c in news_cards[g]]
    failed_parts = [f"{name}: {e['reason']}" for name, e in {**fixed, **districts}.items() if e["status"] == "FAILED"]
    failed_parts += [f"{t}: {v['failureReason']}" for t, v in tracks.items() if v["status"] == "FAILED"]
    audit = {
        "date": today, "completedAt": stamp, "status": "COMPLETE",
        "sourceDiscoveries": discoveries, "tracks": tracks, "fixedSources": fixed,
        "machineSources": machine, "districts": districts, "annualContests": annual,
        "reverifiedIds": reverified, "reverificationEvidence": evidence, "reverificationFailures": failures,
        "publishedIds": published, "sourceGaps": failed_parts,
        "researchLimitations": [
            "조사·확인·카드 작성은 GPT worker가 했고 사람이 보지 않았다.",
            f"주최 측 확인 전으로 올린 공고 {sum(1 for g in new_cards.values() for c in g if c.get('officialCheck'))}건.",
            f"GPT 기록이 비어 FAILED로 남긴 칸 {len(failed_parts)}개.",
        ],
    }
    (root / f"data/research/{today}.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"newContests": len(new_cards["contests"]), "newSupport": len(new_cards["support"]),
            "aiNews": len(news_cards["aiNews"]), "aiDiscovery": len(news_cards["aiDiscovery"]),
            "reverified": len(reverified), "reverifyFailed": len(failures), "failedRecords": failed_parts,
            "pendingOfficial": sum(1 for g in new_cards.values() for c in g if c.get("officialCheck"))}
