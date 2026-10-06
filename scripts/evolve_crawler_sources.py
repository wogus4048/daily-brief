#!/usr/bin/env python3
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = pathlib.Path(os.environ.get("CRAWLER_MANIFEST_PATH", ROOT / "data/crawler-sources.json"))
STATE = pathlib.Path(os.environ.get("CRAWLER_STATE_PATH", ROOT / "data/crawler-source-state.json"))
LATEST = pathlib.Path(os.environ.get("CRAWLER_LATEST_PATH", ROOT / "data/latest.json"))

manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
latest = json.loads(LATEST.read_text(encoding="utf-8"))
date = latest["date"]

audit_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / f"data/research/{date}.json"
cache_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / f"data/source-cache/{date}.json"

audit = json.loads(audit_path.read_text(encoding="utf-8"))
cache = json.loads(cache_path.read_text(encoding="utf-8"))

if STATE.exists():
    state = json.loads(STATE.read_text(encoding="utf-8"))
else:
    state = {"version": 1, "updatedAt": None, "sources": {}}

assert audit.get("date") == date, "research audit date mismatch"
assert cache.get("date") == date, "source cache date mismatch"

policy = manifest.get("policy", {})
promote_policy = policy.get("autoPromote", {})
degrade_policy = policy.get("autoDegrade", {})
recover_policy = policy.get("autoRecover", {})

active = manifest.setdefault("active", [])
degraded = manifest.setdefault("degraded", [])
candidates = manifest.setdefault("nextCandidates", [])
metrics = state.setdefault("sources", {})

active_by_key = {item["key"]: item for item in active}
degraded_by_key = {item["key"]: item for item in degraded}
candidate_by_key = {item["key"]: item for item in candidates}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def key_for(value):
    value = re.sub(r"^https?://", "", value.strip().lower())
    value = re.sub(r"^www\.", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "source"


def ensure_metric(key):
    item = metrics.setdefault(key, {})
    item.setdefault("firstSeenDate", date)
    item.setdefault("lastSeenDate", date)
    item.setdefault("activeRuns", 0)
    item.setdefault("successfulRuns", 0)
    item.setdefault("failedRuns", 0)
    item.setdefault("successStreak", 0)
    item.setdefault("failureStreak", 0)
    item.setdefault("shadowRuns", 0)
    item.setdefault("shadowSuccessfulRuns", 0)
    item.setdefault("shadowFailedRuns", 0)
    item.setdefault("shadowSuccessStreak", 0)
    item.setdefault("shadowFailureStreak", 0)
    item.setdefault("discoverySightings", 0)
    item.setdefault("publishedHits", 0)
    item.setdefault("relevantHits", 0)
    item.setdefault("lastItemCount", 0)
    item.setdefault("lastActionableCount", 0)
    item.setdefault("score", 0)
    return item


def audit_items_for_source(key):
    machine = audit.get("machineSources", {})
    if key in machine and isinstance(machine[key], list):
        return machine[key]
    if key == "daconCompetitions":
        return audit.get("fixedSources", {}).get("DACON", {}).get("competitionsInventory", [])
    if key == "dakerHackathons":
        return audit.get("fixedSources", {}).get("DACON", {}).get("dakerInventory", [])
    return []


# 1) Update active source reliability/yield metrics.
for entry in list(active):
    key = entry["key"]
    m = ensure_metric(key)
    m["lastSeenDate"] = date
    m["activeRuns"] += 1

    source = cache.get("sources", {}).get(key)
    if source and source.get("status") == "OK":
        m["successfulRuns"] += 1
        m["successStreak"] += 1
        m["failureStreak"] = 0
        m["lastItemCount"] = source.get("count", 0)
        m["lastActionableCount"] = source.get("actionableCount", 0)
        m["lastError"] = None

        reviewed = audit_items_for_source(key)
        published = sum(1 for item in reviewed if item.get("disposition") == "PUBLISHED")
        relevant = sum(1 for item in reviewed if item.get("disposition") in ("PUBLISHED", "EXISTING"))
        m["publishedHits"] += published
        m["relevantHits"] += relevant
    else:
        m["failedRuns"] += 1
        m["failureStreak"] += 1
        m["successStreak"] = 0
        m["lastError"] = (source or {}).get("error", "source missing from cache")


# 2) Learn crawler candidates from the daily research itself.
discoveries = audit.get("sourceDiscoveries", [])
assert isinstance(discoveries, list), "research audit sourceDiscoveries must be a list"

for discovery in discoveries:
    if not isinstance(discovery, dict):
        continue
    url = discovery.get("listUrl") or discovery.get("url")
    domain = discovery.get("domain") or (urlsplit(url).netloc if url else "")
    if not domain and not url:
        continue

    key = discovery.get("key") or key_for(domain or url)
    if key in active_by_key:
        m = ensure_metric(key)
        m["discoverySightings"] += 1
        m["lastSeenDate"] = date
        continue

    if key in degraded_by_key:
        target = degraded_by_key[key]
    else:
        target = candidate_by_key.get(key)
        if target is None:
            target = {
                "key": key,
                "name": discovery.get("name") or domain or key,
                "url": url,
                "reason": discovery.get("reason") or "Discovered during daily research",
                "category": discovery.get("category") or "unclassified",
                "status": "NEEDS_SPEC",
                "discoveredAt": date,
            }
            candidates.append(target)
            candidate_by_key[key] = target

    if url and not target.get("url"):
        target["url"] = url
    if discovery.get("crawlerSpec"):
        target["crawlerSpec"] = discovery["crawlerSpec"]
        target["status"] = "SHADOW"

    m = ensure_metric(key)
    if m.get("lastDiscoveryDate") != date:
        m["discoverySightings"] += 1
        m["lastDiscoveryDate"] = date
    m["lastSeenDate"] = date

    published_ids = discovery.get("publishedIds") or []
    relevant_urls = discovery.get("relevantUrls") or discovery.get("candidateUrls") or []
    m["publishedHits"] += len(set(published_ids))
    m["relevantHits"] += len(set(relevant_urls))


# 2b) Auto-discover recurring/relevant domains even when GPT did not explicitly nominate them.
known_keys = set(active_by_key) | set(degraded_by_key) | set(candidate_by_key)
known_domains = set()
for bucket in (active, degraded, candidates):
    for item in bucket:
        url = item.get("url")
        if url:
            known_domains.add(urlsplit(url).netloc.lower().removeprefix("www."))

domain_evidence = {}
for track_id, track in (audit.get("tracks") or {}).items():
    for candidate in track.get("rawCandidates", []) if isinstance(track, dict) else []:
        if not isinstance(candidate, dict):
            continue
        disposition = candidate.get("disposition")
        if disposition not in ("PUBLISHED", "EXISTING"):
            continue
        url = candidate.get("url")
        if not url:
            continue
        try:
            parsed = urlsplit(url)
        except Exception:
            continue
        domain = parsed.netloc.lower().removeprefix("www.")
        if not domain:
            continue
        ev = domain_evidence.setdefault(
            domain,
            {"relevant": 0, "published": 0, "urls": set(), "tracks": {}},
        )
        ev["relevant"] += 1
        ev["tracks"][track_id] = ev["tracks"].get(track_id, 0) + 1
        if disposition == "PUBLISHED":
            ev["published"] += 1
        ev["urls"].add(url)

for domain, ev in domain_evidence.items():
    if domain in known_domains:
        continue
    if ev["published"] < 1 and ev["relevant"] < 2:
        continue

    key = key_for(domain)
    if key in known_keys:
        continue

    dominant_track = max(ev["tracks"], key=ev["tracks"].get) if ev["tracks"] else "unclassified"
    category = "startupSupport" if dominant_track == "startupSupport" else (
        "contest" if dominant_track in ("aiData", "generalSoftware", "publicIdea", "upcomingOpenings") else dominant_track
    )

    candidate = {
        "key": key,
        "name": domain,
        "url": f"https://{domain}/",
        "reason": "Auto-discovered from recurring/relevant daily research candidates",
        "category": category,
        "sourceTracks": sorted(ev["tracks"]),
        "status": "NEEDS_SPEC",
        "discoveredAt": date,
        "autoDiscovered": True,
        "evidenceUrls": sorted(ev["urls"])[:10],
    }
    candidates.append(candidate)
    candidate_by_key[key] = candidate
    known_keys.add(key)
    known_domains.add(domain)

    m = ensure_metric(key)
    m["discoverySightings"] += 1
    m["lastDiscoveryDate"] = date
    m["publishedHits"] += ev["published"]
    m["relevantHits"] += ev["relevant"]
    m["lastSeenDate"] = date


# 3) Update shadow crawler stability.
shadow_sources = cache.get("shadowSources", {})
if not isinstance(shadow_sources, dict):
    shadow_sources = {}

for key, source in shadow_sources.items():
    m = ensure_metric(key)
    m["lastSeenDate"] = date
    m["shadowRuns"] += 1
    if source.get("status") == "OK":
        m["shadowSuccessfulRuns"] += 1
        m["shadowSuccessStreak"] += 1
        m["shadowFailureStreak"] = 0
        m["lastItemCount"] = source.get("count", 0)
        m["lastActionableCount"] = source.get("actionableCount", 0)
        m["lastError"] = None
    else:
        m["shadowFailedRuns"] += 1
        m["shadowFailureStreak"] += 1
        m["shadowSuccessStreak"] = 0
        m["lastError"] = source.get("error")


# 4) Score all known sources.
def calculate_score(m):
    discovery = min(24, m.get("discoverySightings", 0) * 8)
    published = min(30, m.get("publishedHits", 0) * 15)
    relevant = min(16, m.get("relevantHits", 0) * 2)
    shadow = min(30, m.get("shadowSuccessStreak", 0) * 10)
    penalty = min(40, m.get("shadowFailureStreak", 0) * 10 + m.get("failureStreak", 0) * 10)
    return max(0, min(100, discovery + published + relevant + shadow - penalty))


for key, m in metrics.items():
    m["score"] = calculate_score(m)


# 5) Auto-degrade unstable non-required active crawlers.
max_failures = int(degrade_policy.get("maxActiveFailureStreak", 3))
new_active = []
for entry in active:
    key = entry["key"]
    m = ensure_metric(key)
    if not entry.get("required") and entry.get("managed", True) and m["failureStreak"] >= max_failures:
        degraded_entry = dict(entry)
        degraded_entry["status"] = "DEGRADED"
        degraded_entry["degradedAt"] = date
        degraded_entry["degradedReason"] = f"{m['failureStreak']} consecutive active crawl failures"
        degraded.append(degraded_entry)
        degraded_by_key[key] = degraded_entry
        continue
    new_active.append(entry)
active = new_active


# 6) Auto-promote stable, useful shadow candidates.
min_sightings = int(promote_policy.get("minDiscoverySightings", 2))
min_published = int(promote_policy.get("minPublishedHits", 1))
min_shadow = int(promote_policy.get("minShadowSuccessStreak", 3))
min_score = int(promote_policy.get("minScore", 50))

new_candidates = []
for entry in candidates:
    key = entry["key"]
    m = ensure_metric(key)

    if entry.get("status") == "WATCH_ONLY":
        entry["score"] = m["score"]
        entry["recommendation"] = "WATCH_ONLY"
        new_candidates.append(entry)
        continue

    has_spec = isinstance(entry.get("crawlerSpec"), dict)
    promote = (
        has_spec
        and m["discoverySightings"] >= min_sightings
        and m["publishedHits"] >= min_published
        and m["shadowSuccessStreak"] >= min_shadow
        and m["score"] >= min_score
    )

    entry["score"] = m["score"]
    if promote:
        promoted = {
            "key": key,
            "name": entry.get("name", key),
            "url": entry.get("url"),
            "role": entry.get("reason", "Auto-promoted crawler source"),
            "required": False,
            "managed": True,
            "crawlerSpec": entry["crawlerSpec"],
            "promotedAt": date,
            "promotionEvidence": {
                "discoverySightings": m["discoverySightings"],
                "publishedHits": m["publishedHits"],
                "shadowSuccessStreak": m["shadowSuccessStreak"],
                "score": m["score"],
            },
        }
        active.append(promoted)
        active_by_key[key] = promoted
    else:
        if has_spec:
            entry["status"] = "SHADOW"
            entry["recommendation"] = "CONTINUE_SHADOW"
        else:
            entry["status"] = "NEEDS_SPEC"
            entry["recommendation"] = "NEEDS_CRAWLER_SPEC"
        new_candidates.append(entry)
candidates = new_candidates


# 7) Auto-recover degraded sources after stable shadow recovery.
min_recover = int(recover_policy.get("minShadowSuccessStreak", 2))
new_degraded = []
for entry in degraded:
    key = entry["key"]
    m = ensure_metric(key)
    if m["shadowSuccessStreak"] >= min_recover:
        recovered = dict(entry)
        recovered.pop("degradedAt", None)
        recovered.pop("degradedReason", None)
        recovered["status"] = "ACTIVE"
        recovered["recoveredAt"] = date
        active.append(recovered)
        active_by_key[key] = recovered
    else:
        entry["score"] = m["score"]
        new_degraded.append(entry)
degraded = new_degraded


# Deterministic ordering and output.
manifest["active"] = sorted(active, key=lambda item: item["key"])
manifest["degraded"] = sorted(degraded, key=lambda item: item["key"])
manifest["nextCandidates"] = sorted(candidates, key=lambda item: item["key"])
manifest["lastEvolvedDate"] = date
manifest["lastEvolvedAt"] = now_iso()

state["updatedAt"] = now_iso()
state["lastDate"] = date

MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(
    "OK:",
    date,
    f"active={len(manifest['active'])}",
    f"degraded={len(manifest['degraded'])}",
    f"candidates={len(manifest['nextCandidates'])}",
)
