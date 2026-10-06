#!/usr/bin/env python3
import json
import pathlib
import sys
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
assert source_cache.get("date") == snapshot_date, "source cache date must match snapshot date"
assert source_cache.get("crawler", {}).get("engine") == "playwright-chromium", "source cache must come from Playwright crawler"


def normalize_url(value):
    parsed = urlsplit(value)
    path = parsed.path[:-1] if len(parsed.path) > 1 and parsed.path.endswith("/") else parsed.path
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


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
    assert set(published_ids) == new_ids, (
        f"research audit publishedIds mismatch: expected {sorted(new_ids)}, got {sorted(published_ids)}"
    )

    baseline_open = {
        item["id"]
        for group in ("contests", "support")
        for item in baseline.get(group, [])
        if item.get("id") and item.get("status") in ("OPEN", "UPCOMING")
    }
    reverified = audit.get("reverifiedIds")
    assert isinstance(reverified, list), "research audit reverifiedIds must be a list"
    missing = baseline_open - set(reverified)
    assert not missing, f"research audit did not re-verify existing OPEN/UPCOMING ids: {sorted(missing)}"

assert set(published_ids).issubset(candidate_ids), "research audit publishedIds includes ids absent from snapshot"
assert set(published_ids).issubset(all_candidate_ids), "every published id must appear in rawCandidates evidence"

print(
    f"OK: {audit_path} "
    f"({len(published_ids)} published, {len(audit.get('reverifiedIds', []))} reverified, "
    f"DACON actionable {source_cache['totals']['daconActionable']}, DAKER actionable {source_cache['totals']['dakerActionable']})"
)
