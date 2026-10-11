#!/usr/bin/env python3
import json
import pathlib
import sys
import re
from datetime import datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from research_rules import is_reverification_due, normalize_url

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
manifest = json.loads((ROOT / "data/crawler-sources.json").read_text(encoding="utf-8"))
for source_entry in manifest.get("active", []):
    key = source_entry["key"]
    result = source_cache.get("sources", {}).get(key)
    assert isinstance(result, dict), f"source cache missing active source {key}"
    if source_entry.get("required"):
        assert result.get("status") == "OK" and result.get("items"), f"required crawler not healthy: {key}"
        assert isinstance(result.get("actionableItems"), list), f"required crawler inventory missing: {key}"


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
    "aiDiscovery": {
        "axes": ["sitesDirectories", "github", "skillsMcpAgents", "workflows", "communities", "sourceRadar"],
        "min_candidates": 0,
    },
}

# AI Discovery was introduced on 2026-10-07 after that day's scheduled evidence
# had already completed. Before 10-08 the track is optional, but if submitted
# it MUST pass the normal track validation before its candidate IDs count.
if snapshot_date < "2026-10-08" and not isinstance(audit.get("tracks", {}).get("aiDiscovery"), dict):
    TRACKS.pop("aiDiscovery", None)

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
    for group in ("contests", "support", "aiNews", "aiDiscovery")
    for item in data.get(group, [])
    if item.get("id")
}

if baseline is not None:
    for group in ("contests", "support", "aiNews", "aiDiscovery"):
        old_by_id = {x["id"]: x for x in baseline.get(group, []) if x.get("id")}
        new_by_id = {x["id"]: x for x in data.get(group, []) if x.get("id")}
        removed = set(old_by_id) - set(new_by_id)
        assert not removed, f"{group}: cumulative items were removed: {sorted(removed)}"
        changed_first_seen = [
            item_id for item_id, previous in old_by_id.items()
            if new_by_id[item_id].get("firstSeenDate") != previous.get("firstSeenDate")
        ]
        assert not changed_first_seen, f"{group}: firstSeenDate changed: {sorted(changed_first_seen)}"
    baseline_ids = {
        item["id"]
        for group in ("contests", "support", "aiNews", "aiDiscovery")
        for item in baseline.get(group, [])
        if item.get("id")
    }
    added_items = [
        item
        for group in ("contests", "support", "aiNews", "aiDiscovery")
        for item in data.get(group, [])
        if item.get("id") and item["id"] not in baseline_ids
    ]
    stale_first_seen = [
        item["id"] for item in added_items if item.get("firstSeenDate") != snapshot_date
    ]
    assert not stale_first_seen, (
        f"new ids must have firstSeenDate={snapshot_date}: {sorted(stale_first_seen)}"
    )
    new_ids = {item["id"] for item in added_items}
    published_set = set(published_ids)
    if baseline.get("date") == snapshot_date:
        same_day_baseline_ids = {
            item["id"]
            for group in ("contests", "support", "aiNews", "aiDiscovery")
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
        and is_reverification_due(item, snapshot_date)
    }

    current_by_id = {
        item["id"]: item
        for group in ("contests", "support")
        for item in data.get(group, [])
        if item.get("id")
    }
    baseline_by_id = {
        item["id"]: item
        for group in ("contests", "support")
        for item in baseline.get(group, [])
        if item.get("id")
    }

    # Same-day retry/correction: if an earlier snapshot claimed verification today
    # but the candidate rolls that date back, treat the item as effectively due
    # so the correction can be audited instead of being rejected as "not due".
    rescinded_today = {
        item_id
        for item_id, current in current_by_id.items()
        if baseline.get("date") == snapshot_date
        and item_id in baseline_by_id
        and baseline_by_id[item_id].get("lastVerifiedDate") == snapshot_date
        and current.get("lastVerifiedDate") != snapshot_date
        and current.get("status") in ("OPEN", "UPCOMING")
    }
    effective_due = baseline_due | rescinded_today

    reverified = audit.get("reverifiedIds")
    assert isinstance(reverified, list), "research audit reverifiedIds must be a list"
    assert len(reverified) == len(set(reverified)), "research audit reverifiedIds contains duplicates"
    reverified_set = set(reverified)

    evidence = audit.get("reverificationEvidence", [])
    assert isinstance(evidence, list), "research audit reverificationEvidence must be a list"
    evidence_by_id = {}
    for i, item in enumerate(evidence):
        assert isinstance(item, dict), f"reverificationEvidence[{i}] must be an object"
        item_id = item.get("id")
        assert item_id and item_id not in evidence_by_id, f"invalid/duplicate reverificationEvidence id: {item_id!r}"
        source_url = item.get("primarySourceUrl")
        assert isinstance(source_url, str), f"reverificationEvidence[{i}] missing primarySourceUrl"
        parsed_url = urlsplit(source_url)
        hostname = parsed_url.hostname or ""
        try:
            ascii_host = hostname.encode("idna").decode("ascii")
        except UnicodeError:
            ascii_host = ""
        valid_hostname = (
            0 < len(ascii_host) <= 253
            and all(
                re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
                for label in ascii_host.split(".")
            )
        )
        assert parsed_url.scheme in ("http", "https") and valid_hostname and parsed_url.username is None, (
            f"reverificationEvidence[{i}] invalid primarySourceUrl"
        )
        stamp = item.get("verifiedAt")
        assert isinstance(stamp, str), f"reverificationEvidence[{i}] missing verifiedAt"
        try:
            observed_at = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            raise AssertionError(f"reverificationEvidence[{i}] invalid verifiedAt timestamp") from None
        assert observed_at.tzinfo is not None and observed_at.utcoffset() is not None, (
            f"reverificationEvidence[{i}] verifiedAt must include a timezone"
        )
        assert observed_at.astimezone(ZoneInfo("Asia/Seoul")).date().isoformat() == snapshot_date, (
            f"reverificationEvidence[{i}] verifiedAt must be on snapshot date in Asia/Seoul"
        )
        evidence_by_id[item_id] = item

    same_day_material_fields = (
        "status",
        "openingAt",
        "deadlineText",
        "period",
        "title",
        "summary",
        "description",
        "tags",
        "participation",
        "reward",
        "businessRegistration",
        "preStartup",
        "employment",
        "evaluation",
        "aiSupport",
        "ideas",
        "links",
        "categoryLabel",
    )
    same_day_corrected = {
        item_id
        for item_id, current in current_by_id.items()
        if baseline.get("date") == snapshot_date
        and item_id in baseline_by_id
        and baseline_by_id[item_id].get("lastVerifiedDate") == snapshot_date
        and current.get("lastVerifiedDate") == snapshot_date
        and item_id in evidence_by_id
        and any(
            baseline_by_id[item_id].get(field) != current.get(field)
            for field in same_day_material_fields
        )
    }

    # A crawler/search change signal can require official verification before
    # the ordinary cadence expires. Accept these *only* with real evidence,
    # not as a way of bypassing the due gate.
    extra_officially_reverified = {
        item_id
        for item_id in reverified_set
        if item_id in baseline_by_id
        and (
            baseline_by_id[item_id].get("status") in ("OPEN", "UPCOMING")
            or (
                baseline_by_id[item_id].get("status") == "CLOSED"
                and current_by_id.get(item_id, {}).get("status") in ("OPEN", "UPCOMING")
            )
        )
        and current_by_id.get(item_id, {}).get("lastVerifiedDate") == snapshot_date
        and item_id in evidence_by_id
    }
    allowed_reverified = effective_due | same_day_corrected | extra_officially_reverified
    unexpected_reverified = reverified_set - allowed_reverified
    assert not unexpected_reverified, (
        f"research audit reverifiedIds contains non-due/non-correction ids: {sorted(unexpected_reverified)}"
    )
    missing_evidence = reverified_set - set(evidence_by_id)
    assert not missing_evidence, (
        f"research audit reverifiedIds missing primary-source evidence: {sorted(missing_evidence)}"
    )

    changed_opportunities = {
        item_id
        for item_id, previous in baseline_by_id.items()
        if item_id in current_by_id
        and (
            previous.get("status") in ("OPEN", "UPCOMING")
            or current_by_id[item_id].get("status") in ("OPEN", "UPCOMING")
        )
        and any(previous.get(field) != current_by_id[item_id].get(field) for field in same_day_material_fields)
    }
    unverified_changes = changed_opportunities - reverified_set
    assert not unverified_changes, (
        f"material opportunity changes require official re-verification: {sorted(unverified_changes)}"
    )
    missing_update_dates = {
        item_id
        for item_id in changed_opportunities
        if current_by_id[item_id].get("lastUpdatedDate") != snapshot_date
    }
    assert not missing_update_dates, (
        f"material opportunity changes require lastUpdatedDate={snapshot_date}: {sorted(missing_update_dates)}"
    )

    failures = audit.get("reverificationFailures", [])
    assert isinstance(failures, list), "research audit reverificationFailures must be a list"
    failed_ids = set()
    for i, failure in enumerate(failures):
        assert isinstance(failure, dict), f"reverificationFailures[{i}] must be an object"
        item_id = failure.get("id")
        assert item_id in effective_due, f"reverificationFailures[{i}] id is not due: {item_id!r}"
        assert item_id not in failed_ids, f"duplicate reverification failure id: {item_id}"
        assert failure.get("primarySourceUrl"), f"reverificationFailures[{i}] missing primarySourceUrl"
        reason = failure.get("reason")
        assert isinstance(reason, str) and reason.strip(), f"reverificationFailures[{i}] missing reason"
        failed_ids.add(item_id)

    overlap = reverified_set & failed_ids
    assert not overlap, f"ids cannot be both reverified and failed: {sorted(overlap)}"

    missing = effective_due - reverified_set
    assert not missing, (
        f"research audit did not re-verify due OPEN/UPCOMING ids: {sorted(missing)}; "
        f"recorded failures={sorted(failed_ids)}"
    )

    stale = [
        item_id
        for item_id in effective_due
        if current_by_id.get(item_id, {}).get("lastVerifiedDate") != snapshot_date
    ]
    assert not stale, f"due reverified items must set lastVerifiedDate to snapshot date: {sorted(stale)}"

    falsely_advanced = [
        item_id
        for item_id, current in current_by_id.items()
        if item_id in baseline_by_id
        and current.get("lastVerifiedDate") == snapshot_date
        and baseline_by_id[item_id].get("lastVerifiedDate") != snapshot_date
        and item_id not in reverified_set
    ]
    assert not falsely_advanced, (
        f"lastVerifiedDate advanced without reverifiedIds evidence: {sorted(falsely_advanced)}"
    )

assert set(published_ids).issubset(candidate_ids), "research audit publishedIds includes ids absent from snapshot"
assert set(published_ids).issubset(all_candidate_ids), "every published id must appear in rawCandidates evidence"

print(
    f"OK: {audit_path} "
    f"({len(published_ids)} published, {len(audit.get('reverifiedIds', []))} reverified, "
    f"DACON actionable {source_cache['sources']['daconCompetitions']['actionableCount']}, "
    f"DAKER actionable {source_cache['sources']['dakerHackathons']['actionableCount']})"
)
