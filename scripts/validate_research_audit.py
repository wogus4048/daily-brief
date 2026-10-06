#!/usr/bin/env python3
import json
import pathlib
import sys
import urllib.request
import urllib.parse
from html.parser import HTMLParser

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

assert audit.get("date") == snapshot_date, "research audit date must match snapshot date"
assert audit.get("completedAt"), "research audit missing completedAt"

class _DaconHomeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.section = None
        self.in_h3 = False
        self.h3_text = []
        self.anchor = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h3":
            self.in_h3 = True
            self.h3_text = []
        if tag == "a" and self.section:
            self.anchor = {"href": attrs.get("href", ""), "text": []}

    def handle_data(self, data):
        if self.in_h3:
            self.h3_text.append(data)
        if self.anchor is not None:
            self.anchor["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "h3":
            text = " ".join("".join(self.h3_text).split())
            if "데이커: 진행 중인 해커톤" in text:
                self.section = "dakerOngoing"
            elif "진행 중인 경진대회" in text:
                self.section = "officialOngoing"
            elif self.section:
                self.section = None
            self.in_h3 = False
            self.h3_text = []
        elif tag == "a" and self.anchor is not None:
            href = self.anchor["href"]
            text = " ".join("".join(self.anchor["text"]).split())
            if href and text:
                absolute = urllib.parse.urljoin("https://www.dacon.io/", href)
                host = urllib.parse.urlparse(absolute).netloc.lower()
                path = urllib.parse.urlparse(absolute).path
                if self.section == "dakerOngoing" and host.endswith("daker.ai"):
                    self.items.append((self.section, absolute, text))
                elif self.section == "officialOngoing" and "/competitions/official/" in path:
                    self.items.append((self.section, absolute, text))
            self.anchor = None

def fetch_dacon_home_inventory():
    req = urllib.request.Request(
        "https://www.dacon.io/",
        headers={"User-Agent": "daily-brief-coverage-check/1.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    parser = _DaconHomeParser()
    parser.feed(html)
    seen = {}
    for section, url, title in parser.items:
        clean = urllib.parse.urlsplit(url)
        normalized = urllib.parse.urlunsplit((clean.scheme, clean.netloc, clean.path, "", ""))
        seen[normalized] = {"section": section, "url": normalized, "title": title}
    inventory = list(seen.values())
    if not inventory:
        raise AssertionError("DACON live inventory extraction returned zero ongoing items")
    return inventory


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
        distinct.add((candidate["title"].strip().lower(), candidate["url"].strip()))
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
if dacon.get("status") == "CHECKED":
    inventory = dacon.get("inventory")
    assert isinstance(inventory, list) and inventory, "DACON CHECKED requires full homepage inventory evidence"
    allowed_dispositions = {"PUBLISHED", "EXISTING", "DUPLICATE", "INELIGIBLE", "CLOSED", "NOT_RELEVANT"}
    audit_urls = set()
    for i, item in enumerate(inventory):
        assert isinstance(item, dict), f"DACON.inventory[{i}] must be an object"
        assert item.get("title"), f"DACON.inventory[{i}] missing title"
        assert item.get("url"), f"DACON.inventory[{i}] missing url"
        assert item.get("section") in ("dakerOngoing", "officialOngoing"), f"DACON.inventory[{i}] invalid section"
        assert item.get("disposition") in allowed_dispositions, f"DACON.inventory[{i}] invalid disposition"
        parsed = urllib.parse.urlsplit(item["url"])
        normalized = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        audit_urls.add(normalized)

    live_inventory = fetch_dacon_home_inventory()
    live_urls = {item["url"] for item in live_inventory}
    missing = live_urls - audit_urls
    assert not missing, f"DACON homepage ongoing inventory not fully reviewed: {sorted(missing)}"

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
    f"({len(published_ids)} published, {len(audit.get('reverifiedIds', []))} reverified)"
)
