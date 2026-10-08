#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/evolve_crawler_sources.py"
DATE = "2026-10-06"

with tempfile.TemporaryDirectory() as td:
    root = pathlib.Path(td)
    manifest_path = root / "crawler-sources.json"
    state_path = root / "crawler-source-state.json"
    latest_path = root / "latest.json"
    audit_path = root / "research.json"
    cache_path = root / "cache.json"

    manifest = {
        "version": 2,
        "policy": {
            "autoPromote": {
                "minDiscoverySightings": 2,
                "minPublishedHits": 1,
                "minShadowSuccessStreak": 3,
                "minScore": 50,
            },
            "autoDegrade": {"maxActiveFailureStreak": 3},
            "autoRecover": {"minShadowSuccessStreak": 2},
        },
        "active": [
            {
                "key": "requiredSource",
                "name": "Required",
                "url": "https://required.example/list",
                "required": True,
                "managed": True,
            },
            {
                "key": "unstableSource",
                "name": "Unstable",
                "url": "https://unstable.example/list",
                "required": False,
                "managed": True,
                "crawlerSpec": {
                    "url": "https://unstable.example/list",
                    "linkSelector": "a.item",
                    "actionability": "all",
                },
            },
        ],
        "degraded": [
            {
                "key": "recoverSource",
                "name": "Recover",
                "url": "https://recover.example/list",
                "required": False,
                "managed": True,
                "crawlerSpec": {
                    "url": "https://recover.example/list",
                    "linkSelector": "a.item",
                    "actionability": "all",
                },
                "status": "DEGRADED",
            }
        ],
        "nextCandidates": [
            {
                "key": "promoteSource",
                "name": "Promote",
                "category": "aiDiscovery",
                "sourceTracks": ["aiDiscovery"],
                "url": "https://promote.example/list",
                "status": "SHADOW",
                "crawlerSpec": {
                    "url": "https://promote.example/list",
                    "linkSelector": "a.item",
                    "actionability": "all",
                },
            }
        ],
    }

    state = {
        "version": 1,
        "sources": {
            "unstableSource": {
                "failureStreak": 2,
                "successStreak": 0,
                "activeRuns": 2,
                "successfulRuns": 0,
                "failedRuns": 2,
                "shadowRuns": 0,
                "shadowSuccessfulRuns": 0,
                "shadowFailedRuns": 0,
                "shadowSuccessStreak": 0,
                "shadowFailureStreak": 0,
                "discoverySightings": 0,
                "publishedHits": 0,
                "relevantHits": 0,
                "lastItemCount": 0,
                "lastActionableCount": 0,
                "score": 0,
            },
            "promoteSource": {
                "failureStreak": 0,
                "successStreak": 0,
                "activeRuns": 0,
                "successfulRuns": 0,
                "failedRuns": 0,
                "shadowRuns": 2,
                "shadowSuccessfulRuns": 2,
                "shadowFailedRuns": 0,
                "shadowSuccessStreak": 2,
                "shadowFailureStreak": 0,
                "discoverySightings": 2,
                "publishedHits": 1,
                "relevantHits": 0,
                "lastItemCount": 3,
                "lastActionableCount": 2,
                "score": 0,
            },
            "recoverSource": {
                "failureStreak": 0,
                "successStreak": 0,
                "activeRuns": 0,
                "successfulRuns": 0,
                "failedRuns": 0,
                "shadowRuns": 1,
                "shadowSuccessfulRuns": 1,
                "shadowFailedRuns": 0,
                "shadowSuccessStreak": 1,
                "shadowFailureStreak": 0,
                "discoverySightings": 0,
                "publishedHits": 0,
                "relevantHits": 0,
                "lastItemCount": 2,
                "lastActionableCount": 1,
                "score": 0,
            },
        },
    }

    latest = {"date": DATE, "contests": [], "support": [], "aiNews": []}
    audit = {
        "date": DATE,
        "sourceDiscoveries": [],
        "machineSources": {
            "requiredSource": [],
            "unstableSource": [],
        },
        "fixedSources": {},
        "tracks": {
            "startupSupport": {
                "rawCandidates": [
                    {
                        "title": "Startup support example",
                        "url": "https://startup-source.example/program/1",
                        "disposition": "PUBLISHED",
                    },
                    {
                        "title": "Startup support example 2",
                        "url": "https://startup-source.example/program/2",
                        "disposition": "EXISTING",
                    },
                ]
            }
        },
    }
    cache = {
        "date": DATE,
        "sources": {
            "requiredSource": {
                "status": "OK",
                "count": 4,
                "actionableCount": 2,
            },
            "unstableSource": {
                "status": "FAILED",
                "count": 0,
                "actionableCount": 0,
                "error": "synthetic failure",
            },
        },
        "shadowSources": {
            "promoteSource": {
                "status": "OK",
                "count": 4,
                "actionableCount": 2,
            },
            "recoverSource": {
                "status": "OK",
                "count": 3,
                "actionableCount": 1,
            },
        },
    }

    for path, value in [
        (manifest_path, manifest),
        (state_path, state),
        (latest_path, latest),
        (audit_path, audit),
        (cache_path, cache),
    ]:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    env = os.environ.copy()
    env["CRAWLER_MANIFEST_PATH"] = str(manifest_path)
    env["CRAWLER_STATE_PATH"] = str(state_path)
    env["CRAWLER_LATEST_PATH"] = str(latest_path)

    subprocess.run(
        [sys.executable, str(SCRIPT), str(audit_path), str(cache_path)],
        check=True,
        env=env,
    )

    evolved = json.loads(manifest_path.read_text(encoding="utf-8"))
    active = {item["key"]: item for item in evolved["active"]}
    degraded = {item["key"]: item for item in evolved["degraded"]}
    candidates = {item["key"]: item for item in evolved["nextCandidates"]}

    assert "requiredSource" in active, "required source must remain active"
    assert "unstableSource" not in active, "unstable non-required source should auto-degrade"
    assert "unstableSource" in degraded, "unstable source missing from degraded bucket"
    assert "promoteSource" in active, "stable/high-yield shadow candidate should auto-promote"
    assert active["promoteSource"].get("category") == "aiDiscovery", "promotion must preserve source category"
    assert active["promoteSource"].get("sourceTracks") == ["aiDiscovery"], "promotion must preserve editorial tracks"
    assert "promoteSource" not in candidates, "promoted candidate should leave candidate bucket"
    assert "recoverSource" in active, "degraded source should auto-recover after shadow stability"
    assert "recoverSource" not in degraded, "recovered source should leave degraded bucket"
    assert "startup-source-example" in candidates, "startup support domain should be auto-discovered"
    assert candidates["startup-source-example"].get("category") == "startupSupport", (
        "startup support discovery must retain its category"
    )
    assert candidates["startup-source-example"].get("sourceTracks") == ["startupSupport"]

    before_manifest = manifest_path.read_bytes()
    before_state = state_path.read_bytes()
    subprocess.run([sys.executable, str(SCRIPT), str(audit_path), str(cache_path)], check=True, env=env)
    assert manifest_path.read_bytes() == before_manifest, "same-day retries must not manufacture source promotion evidence"
    assert state_path.read_bytes() == before_state, "same-day retries must not inflate stability/yield counters"

    print("OK: crawler source lifecycle promotion/degradation/recovery/category tracking")
