#!/usr/bin/env python3
import json
import pathlib
import sys
import re
from datetime import date as date_cls, datetime, timedelta
from urllib.parse import urlsplit, urlunsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]

data_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data/latest.json"
data = json.loads(data_path.read_text(encoding="utf-8"))
snapshot_date = data.get("date")

audit_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / f"data/research/{snapshot_date}.json"
audit = json.loads(audit_path.read_text(encoding="utf-8"))

baseline = None
if len(sys.argv) > 3:
    baseline_path = pathlib.Path(sys.argv[3])
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))

cache_path = ROOT / f"data/source-cache/{snapshot_date}.json"
assert cache_path.exists(), f"missing Playwright source cache: {cache_path}"
source_cache = json.loads(cache_path.read_text(encoding="utf-8"))

assert audit.get("date") == snapshot_date, "research audit date must match snapshot date"
assert audit.get("completedAt"), "research audit missing completedAt"
assert isinstance(audit.get("sourceDiscoveries"), list), "research audit sourceDiscoveries must be a list"
assert source_cache.get("date") == snapshot_date, "source cache date must match snapshot date"
assert source_cache.get("crawler", {}).get("engine") == "playwright-chromium", "source cache must come from Playwright crawler"


def normalize_url(value):
    parsed = urlsplit(value)
    path = parsed.path[:-1] if len(parsed.path) > 1 and parsed.path.endswith("/") else parsed.path
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date_cls.fromisoformat(str(value)[:10])
        except ValueError:
            return None


def _nearest_deadline_date(item, today):
    candidates = []
    for field in ("deadlineText", "period"):
        text = str(item.get(field) or "")
        for y, m, d in re.findall(r"(?:(20\d{2})[.\-/])?(\d{1,2})[.\-/](\d{1,2})", text):
            year = int(y) if y else today.year
            try:
                dt = date_cls(year, int(m), int(d))
            except ValueError:
                continue
            if dt < today and not y:
                try:
                    dt = date_cls(today.year + 1, int(m), int(d))
                except ValueError:
                    continue
            if dt >= today:
                candidates.append(dt)
    return min(candidates) if candidates else None


def _reverify_due(item, snapshot_date):
    today = date_cls.fromisoformat(snapshot_date)
    last = _parse_iso_date(item.get("lastVerifiedDate"))
    if last is None:
        return True

    if item.get("status") == "UPCOMING":
        opening = _parse_iso_date(item.get("openingAt"))
        interval_days = 1 if opening and opening <= today + timedelta(days=1) else 2
    else:
        deadline = _nearest_deadline_date(item, today)
        days_left = (deadline - today).days if deadline else None
        if days_left is not None and days_left <= 3:
            interval_days = 1
        elif days_left is not None and days_left <= 14:
            interval_days = 2
        else:
            interval_days = 7

    return (today - last).days >= interval_days


TRACKS = {
    "aiData": {
        "axes": ["llmAgents", "mlData", "visionSpeech"],
        "min_candidates": 10,
    },
    "generalSoftware": {
        "axes": ["appWebMobile", "backendApiCloudDevOps", "security", "fintech", "publicDataGovTech", "productBuild"],
        "min_candidates": 15,
    },
    "publicIdea": {
        "axes": ["governmentPublic", "industrySpecialized", "individualPrize"],
        "min_candidates": 10,
    },
    "startupSupport": {
        "axes": ["kstartupBusinessInfo", "sbaSeoul", "nipaKisa", "fintechSupport", "credits"],
        "min_candidates": 15,
    },
    "upcomingOpenings": {
        "axes": ["announcedNotOpen", "firstComeCountdown"],
        "min_candidates": 0,
    },
    "aiNews": {
        "axes": ["officialProduct", "githubReleases", "huggingFace", "researchLabs", "communities"],
        "min_candidates": 0,
    },
}

tracks = audit.get("tracks")
assert isinstance(tracks, dict), "research audit tracks must be an object"

all_candidate_ids = set()
for track_id, rule in TRACKS.items():
    track = tracks.get(track_id)
    assert isinstance(track, dict), f"research audit missing track {track_id}"
    status = track.get("status")
    assert status in ("DONE", "EXHAUSTED"), f"{track_id}.status must be DONE or EXHAUSTED"

    queries_by_axis = track.get("queriesByAxis")
    assert isinstance(queries_by_axis, dict), f"{track_id}.queriesByAxis must be an object"
    for axis in rule["axes"]:
        queries = queries_by_axis.get(axis)
        assert isinstance(queries, list) and queries, f"{track_id} missing executed queries for axis {axis}"
        assert all(isinstance(q, str) and q.strip() for q in queries), f"{track_id}.{axis} has invalid query evidence"

    raw = track.get("rawCandidates")
    assert isinstance(raw, list), f"{track_id}.rawCandidates must be a list"
    distinct = set()
    for i, candidate in enumerate(raw):
        assert isinstance(candidate, dict), f"{track_id}.rawCandidates[{i}] must be an object"
        assert candidate.get("title"), f"{track_id}.rawCandidates[{i}] missing title"
        assert candidate.get("url"), f"{track_id}.rawCandidates[{i}] missing url"
        disposition = candidate.get("disposition")
        assert disposition in ("PUBLISHED", "EXISTING", "DUPLICATE", "INELIGIBLE", "CLOSED", "NOT_RELEVANT"), (
            f"{track_id}.rawCandidates[{i}] invalid disposition"
        )
        distinct.add((candidate["title"].strip().lower(), normalize_url(candidate["url"])))
        if candidate.get("id"):
            all_candidate_ids.add(candidate["id"])

    minimum = rule["min_candidates"]
    if status == "DONE" and minimum:
        assert len(distinct) >= minimum, (
            f"{track_id} has {len(distinct)} distinct raw candidates; expected at least {minimum} or mark EXHAUSTED with evidence"
        )
    if status == "EXHAUSTED":
        reason = track.get("exhaustedReason")
        assert isinstance(reason, str) and len(reason.strip()) >= 20, f"{track_id} EXHAUSTED requires a concrete exhaustedReason"

REQUIRED_SOURCES = [
    "DACON",
    "Hackathon Korea",
    "Grantly",
    "링커리어",
    "요즘것들",
    "ContestKorea",
    "소통24",
    "정책브리핑",
    "AI_TOP_100",
    "EventUs/Luma/온오프믹스",
    "Devpost/Meetup",
    "K-Startup",
    "기업마당",
    "SBA",
    "NIPA",
    "KISA",
    "fintech",
]
sources = audit.get("fixedSources")
assert isinstance(sources, dict), "research audit fixedSources must be an object"
for source in REQUIRED_SOURCES:
    evidence = sources.get(source)
    assert isinstance(evidence, dict), f"missing fixed-source evidence for {source}"
    status = evidence.get("status")
    assert status in ("CHECKED", "FAILED"), f"{source}.status must be CHECKED or FAILED"
    urls = evidence.get("urls")
    assert isinstance(urls, list) and urls, f"{source} must record at least one checked URL"
    if status == "FAILED":
        reason = evidence.get("reason")
        assert isinstance(reason, str) and reason.strip(), f"{source} FAILED requires reason"

dacon = sources["DACON"]
assert dacon.get("status") == "CHECKED", "DACON must be CHECKED using the Playwright source cache"
checked_urls = {normalize_url(url) for url in dacon.get("urls", [])}
assert normalize_url("https://www.dacon.io/competitions") in checked_urls, "DACON evidence must include competitions page"
assert normalize_url("https://daker.ai/public/hackathons") in checked_urls, "DACON evidence must include DAKER hackathons page"

allowed_dispositions = {"PUBLISHED", "EXISTING", "DUPLICATE", "INELIGIBLE", "CLOSED", "NOT_RELEVANT"}
inventory_specs = [
    (
        "competitionsInventory",
        source_cache.get("sources", {}).get("daconCompetitions", {}).get("actionableItems", []),
        "DACON competitions",
    ),
    (
        "dakerInventory",
        source_cache.get("sources", {}).get("dakerHackathons", {}).get("actionableItems", []),
        "DAKER hackathons",
    ),
]

for field, cached_items, label in inventory_specs:
    assert isinstance(cached_items, list) and cached_items, f"source cache missing {label} inventory"
    audit_inventory = dacon.get(field)
    assert isinstance(audit_inventory, list) and audit_inventory, f"DACON CHECKED requires {field}"

    audit_urls = set()
    for i, item in enumerate(audit_inventory):
        assert isinstance(item, dict), f"DACON.{field}[{i}] must be an object"
        assert item.get("title"), f"DACON.{field}[{i}] missing title"
        assert item.get("url"), f"DACON.{field}[{i}] missing url"
        assert item.get("disposition") in allowed_dispositions, f"DACON.{field}[{i}] invalid disposition"
        audit_urls.add(normalize_url(item["url"]))

    cache_urls = {normalize_url(item["url"]) for item in cached_items if item.get("url")}
    missing = cache_urls - audit_urls
    assert not missing, f"{label} crawler inventory not fully reviewed: {sorted(missing)}"

machine_sources = audit.get("machineSources")
assert isinstance(machine_sources, dict), "research audit machineSources must be an object"

for key, cached_source in source_cache.get("sources", {}).items():
    if key in ("daconCompetitions", "dakerHackathons"):
        continue
    if cached_source.get("status") == "FAILED":
        continue

    cached_items = cached_source.get("actionableItems", [])
    assert isinstance(cached_items, list), f"source cache {key}.actionableItems must be a list"

    audit_items = machine_sources.get(key)
    assert isinstance(audit_items, list), f"research audit missing machineSources.{key}"

    audit_urls = set()
    for i, item in enumerate(audit_items):
        assert isinstance(item, dict), f"machineSources.{key}[{i}] must be an object"
        assert item.get("title"), f"machineSources.{key}[{i}] missing title"
        assert item.get("url"), f"machineSources.{key}[{i}] missing url"
        assert item.get("disposition") in allowed_dispositions, f"machineSources.{key}[{i}] invalid disposition"
        audit_urls.add(normalize_url(item["url"]))

    cache_urls = {normalize_url(item["url"]) for item in cached_items if item.get("url")}
    missing = cache_urls - audit_urls
    assert not missing, f"{key} crawler inventory not fully reviewed: {sorted(missing)}"

districts = audit.get("districts")
assert isinstance(districts, dict), "research audit districts must be an object"
for district in ("nowon", "dobong", "gangbuk"):
    evidence = districts.get(district)
    assert isinstance(evidence, dict), f"missing district evidence for {district}"
    status = evidence.get("status")
    assert status in ("CHECKED", "FAILED"), f"{district}.status must be CHECKED or FAILED"
    urls = evidence.get("urls")
    assert isinstance(urls, list) and urls, f"{district} must record at least one checked URL"
    if status == "FAILED":
        reason = evidence.get("reason")
        assert isinstance(reason, str) and reason.strip(), f"{district} FAILED requires reason"

published_ids = audit.get("publishedIds")
assert isinstance(published_ids, list), "research audit publishedIds must be a list"
assert len(published_ids) == len(set(published_ids)), "research audit publishedIds contains duplicates"

candidate_ids = {
    item["id"]
    for group in ("contests", "support", "aiNews")
    for item in data.get(group, [])
    if item.get("id")
}

if baseline is not None:
    baseline_ids = {
        item["id"]
        for group in ("contests", "support", "aiNews")
        for item in baseline.get(group, [])
        if item.get("id")
    }
    new_ids = {
        item["id"]
        for group in ("contests", "support", "aiNews")
        for item in data.get(group, [])
        if item.get("id") and item["id"] not in baseline_ids and item.get("firstSeenDate") == snapshot_date
    }
    published_set = set(published_ids)
    if baseline.get("date") == snapshot_date:
        same_day_baseline_ids = {
            item["id"]
            for group in ("contests", "support", "aiNews")
            for item in baseline.get(group, [])
            if item.get("id") and item.get("firstSeenDate") == snapshot_date
        }
        allowed = same_day_baseline_ids | new_ids
        missing_new = new_ids - published_set
        unexpected = published_set - allowed
        assert not missing_new, (
            f"research audit publishedIds missing newly added ids on same-day retry: {sorted(missing_new)}"
        )
        assert not unexpected, (
            f"research audit publishedIds contains ids not attributable to this snapshot date: {sorted(unexpected)}"
        )
    else:
        assert published_set == new_ids, (
            f"research audit publishedIds mismatch: expected {sorted(new_ids)}, got {sorted(published_ids)}"
        )

    baseline_due = {
        item["id"]
        for group in ("contests", "support")
        for item in baseline.get(group, [])
        if item.get("id")
        and item.get("status") in ("OPEN", "UPCOMING")
        and _reverify_due(item, snapshot_date)
    }
    reverified = audit.get("reverifiedIds")
    assert isinstance(reverified, list), "research audit reverifiedIds must be a list"
    missing = baseline_due - set(reverified)
    assert not missing, f"research audit did not re-verify due OPEN/UPCOMING ids: {sorted(missing)}"

    current_by_id = {
        item["id"]: item
        for group in ("contests", "support")
        for item in data.get(group, [])
        if item.get("id")
    }
    stale = [
        item_id
        for item_id in baseline_due
        if current_by_id.get(item_id, {}).get("lastVerifiedDate") != snapshot_date
    ]
    assert not stale, f"due reverified items must set lastVerifiedDate to snapshot date: {sorted(stale)}"

assert set(published_ids).issubset(candidate_ids), "research audit publishedIds includes ids absent from snapshot"
assert set(published_ids).issubset(all_candidate_ids), "every published id must appear in rawCandidates evidence"

print(
    f"OK: {audit_path} "
    f"({len(published_ids)} published, {len(audit.get('reverifiedIds', []))} reverified, "
    f"DACON actionable {source_cache['sources']['daconCompetitions']['actionableCount']}, "
    f"DAKER actionable {source_cache['sources']['dakerHackathons']['actionableCount']})"
)
