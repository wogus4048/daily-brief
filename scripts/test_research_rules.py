#!/usr/bin/env python3
"""Regression tests for research gating; synthetic fixtures never get published."""

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from research_rules import (
    all_deadlines_passed,
    apply_deadlines,
    can_close_without_verification,
    close_expired_out_of_scope,
    deadline_info,
    is_out_of_scope,
    is_reverification_due,
    normalize_url,
    parse_seoul_date,
)
from research_worklist import build_worklist

ROOT = Path(__file__).resolve().parents[1]
# Decode child output as UTF-8 regardless of the host locale (e.g. cp949 on Windows).
UTF8_RUN = dict(capture_output=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})


class RiskRulesTest(unittest.TestCase):
    def test_query_is_identity_not_tracking(self):
        base = "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do"
        first = f"{base}?pbancSn=179357&schM=view"
        second = f"{base}?pbancSn=179371&schM=view"
        self.assertNotEqual(normalize_url(first), normalize_url(second))
        self.assertEqual(normalize_url(first), normalize_url(f"{base}?utm_source=test&schM=view&pbancSn=179357"))
        self.assertNotEqual(
            normalize_url("https://sotong.go.kr/front/epilogue/epilogueNewViewPage.do?bbs_id=a"),
            normalize_url("https://sotong.go.kr/front/epilogue/epilogueNewViewPage.do?bbs_id=b"),
        )

    def test_risk_cadence_and_seoul_timezone(self):
        self.assertEqual(parse_seoul_date("2026-10-10T16:00:00Z"), date(2026, 10, 11))
        self.assertTrue(is_reverification_due(
            {"status": "OPEN", "lastVerifiedDate": "2026-10-10", "deadline": ["2026-10-11"]}, "2026-10-11"
        ))
        self.assertFalse(is_reverification_due(
            {"status": "OPEN", "lastVerifiedDate": "2026-10-10", "deadline": ["2026-10-24"]}, "2026-10-11"
        ))
        # Passed deadlines are closed by publish, not re-checked.
        self.assertFalse(is_reverification_due(
            {"status": "OPEN", "lastVerifiedDate": "2026-10-01", "deadline": ["2026-10-10"]}, "2026-10-11"
        ))
        self.assertTrue(is_reverification_due(
            {"status": "UPCOMING", "lastVerifiedDate": "2026-10-10", "openingAt": "2026-10-12T08:00:00+09:00"},
            "2026-10-11",
        ))

    def test_out_of_scope_host_is_never_due(self):
        devpost = {"status": "OPEN", "lastVerifiedDate": "2026-10-01", "links": [
            {"url": "https://example.org/first"}, {"url": "https://nexus.devpost.com/"},
        ]}
        self.assertTrue(is_out_of_scope(devpost))
        self.assertFalse(is_reverification_due(devpost, "2026-11-05"))
        korean = {"status": "OPEN", "lastVerifiedDate": "2026-10-01", "links": [{"url": "https://example.org/"}]}
        self.assertFalse(is_out_of_scope(korean))
        self.assertTrue(is_reverification_due(korean, "2026-11-05"))

    def test_structured_deadline_is_read_as_written(self):
        # The researcher writes `deadline`; prose in deadlineText is never parsed
        # (review-2026-11-09-dday-implementation.md: guessing from prose misread real items).
        self.assertEqual(deadline_info({"deadline": ["2026-10-26", "2026-10-22"]}),
                         {"kind": "DATE", "dates": [date(2026, 10, 22), date(2026, 10, 26)]})
        self.assertEqual(deadline_info({"deadline": "예산 소진 시", "deadlineText": "11.30"}), {"kind": "ROLLING", "label": "예산 소진 시"})
        for value in ("확인 필요", None):
            self.assertEqual(deadline_info({"deadline": value, "deadlineText": "행사 12.11"})["kind"], "UNKNOWN")
        for value in ("11.20", ["11.20"], ["2026-02-30"], [], "연중"):
            self.assertEqual(deadline_info({"deadline": value})["kind"], "INVALID", value)
        tracks = {"deadline": ["2026-10-22", "2026-10-26"]}
        self.assertFalse(all_deadlines_passed(tracks, date(2026, 10, 26)))
        self.assertTrue(all_deadlines_passed(tracks, date(2026, 10, 27)))

    def test_publish_writes_dday_and_closes_passed(self):
        snapshot = {"contests": [
            {"id": "passed", "status": "OPEN", "deadline": ["2026-11-05"], "dDay": "D-3"},
            {"id": "today", "status": "OPEN", "deadline": ["2026-11-06"], "dDay": "D-1"},
            {"id": "tracks", "status": "OPEN", "deadline": ["2026-11-01", "2026-11-20"], "dDay": "D-1"},
            {"id": "rolling", "status": "OPEN", "deadline": "상시", "dDay": "D-24"},
            {"id": "upcoming", "status": "UPCOMING", "deadline": ["2026-11-01"], "dDay": "접수 예정"},
            {"id": "unfilled", "status": "OPEN", "deadlineText": "11.01", "dDay": "D-5"},
        ], "support": []}
        self.assertEqual(apply_deadlines(snapshot, "2026-11-06"), ["passed"])
        passed, today, tracks, rolling, upcoming, unfilled = snapshot["contests"]
        self.assertEqual((passed["status"], passed["autoClosedDate"], passed["lastUpdatedDate"]), ("CLOSED", "2026-11-06", "2026-11-06"))
        self.assertEqual([today["dDay"], tracks["dDay"], rolling["dDay"]], ["오늘 마감", "D-14", "상시"])
        self.assertEqual(upcoming, {"id": "upcoming", "status": "UPCOMING", "deadline": ["2026-11-01"], "dDay": "접수 예정"})
        self.assertEqual(unfilled, {"id": "unfilled", "status": "OPEN", "deadlineText": "11.01", "dDay": "D-5"})
        # The audit accepts today's date closure without an official check.
        self.assertTrue(can_close_without_verification({"status": "OPEN"}, passed, date(2026, 11, 6)))
        self.assertFalse(can_close_without_verification({"status": "OPEN"}, {**passed, "autoClosedDate": None}, date(2026, 11, 6)))

    def test_validator_rejects_hand_written_deadlines(self):
        base = json.loads((ROOT / "data/archive/2026-10-07.json").read_text(encoding="utf-8"))
        snapshot = {**base, "date": "2026-11-10", "contests": [], "support": []}
        good = {"id": "x", "title": "t", "summary": "s", "firstSeenDate": "2026-11-01",
                "lastVerifiedDate": "2026-11-10", "status": "OPEN", "deadline": ["2026-11-20"]}
        apply_deadlines({"contests": [good]}, "2026-11-10")
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "latest.json"
            bad = ({**good, "dDay": "D-30"}, {**good, "deadline": "11.20"}, {k: v for k, v in good.items() if k != "deadline"})
            for item, ok in ((good, True), *((item, False) for item in bad)):
                path.write_text(json.dumps({**snapshot, "contests": [item]}, ensure_ascii=False), encoding="utf-8")
                run = subprocess.run([sys.executable, str(ROOT / "scripts/validate_data.py"), str(path)], **UTF8_RUN)
                self.assertEqual(run.returncode == 0, ok, run.stderr)

    def test_only_expired_out_of_scope_items_close(self):
        link = [{"url": "https://x.devpost.com/"}]
        snapshot = {"contests": [
            {"id": "gone", "status": "OPEN", "deadline": ["2026-10-31"], "links": link},
            {"id": "live", "status": "OPEN", "deadline": ["2026-11-13"], "links": link},
            {"id": "korean", "status": "OPEN", "deadline": ["2026-10-31"], "links": [{"url": "https://example.org/"}]},
        ], "support": []}
        self.assertEqual(close_expired_out_of_scope(snapshot, "2026-11-05"), ["gone"])
        closed, live, korean = snapshot["contests"]
        self.assertEqual((closed["status"], closed["lastUpdatedDate"]), ("CLOSED", "2026-11-05"))
        self.assertEqual((live["status"], korean["status"]), ("OPEN", "OPEN"))

    def test_worklist_is_not_audit(self):
        # Use fixed historical fixtures in a disposable root, not today's
        # mutable latest.json: this suite runs before EVERY future promotion.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "data/source-cache").mkdir(parents=True)
            for source, target in (
                ("data/archive/2026-10-07.json", "data/latest.json"),
                ("data/source-cache/2026-10-11.json", "data/source-cache/2026-10-11.json"),
            ):
                (root / target).write_bytes((ROOT / source).read_bytes())
            # Snapshots before 2026-11-10 carry no structured deadline; give the item one a day ahead.
            fixture = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
            for row in fixture["contests"]:
                if row["id"] == "fintech-idea-contest-2026":
                    row["deadline"] = ["2026-10-12"]
            (root / "data/latest.json").write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
            sample_cache = json.loads((root / "data/source-cache/2026-10-11.json").read_text(encoding="utf-8"))
            fixture_manifest = {
                "active": [
                    {"key": key, "required": key in ("daconCompetitions", "dakerHackathons")}
                    for key in sample_cache["sources"]
                ]
            }
            (root / "data/crawler-sources.json").write_text(json.dumps(fixture_manifest), encoding="utf-8")
            plan = build_worklist("2026-10-11", root=root)
            self.assertTrue(plan["cachePresentAndCurrent"])
            self.assertEqual(plan["baselineDate"], "2026-10-07")
            self.assertTrue(any(row["id"] == "fintech-idea-contest-2026" for row in plan["reverificationDue"]))
            self.assertEqual(len(plan["activeSources"]["kStartupHighlights"]["actionableItems"]), 4)
            self.assertEqual(len(plan["activeSources"]["sotong24Contests"]["actionableItems"]), 4)
            self.assertTrue(plan["activeSources"]["devpostOpen"]["sourceGap"])
            self.assertIn("WORKLIST ONLY", plan["note"])


class EvidenceGateIntegrationTest(unittest.TestCase):
    def make_fixture(self, directory):
        """Synthetic test-only evidence to isolate URL completeness enforcement."""
        cache = json.loads((ROOT / "data/source-cache/2026-10-11.json").read_text(encoding="utf-8"))
        (directory / "scripts").mkdir()
        (directory / "data/source-cache").mkdir(parents=True)
        for name in ("validate_research_audit.py", "research_rules.py"):
            (directory / "scripts" / name).write_bytes((ROOT / "scripts" / name).read_bytes())
        (directory / "data/source-cache/2026-10-11.json").write_text(json.dumps(cache), encoding="utf-8")
        (directory / "data/crawler-sources.json").write_text(json.dumps({
            "active": [
                {"key": key, "required": key in ("daconCompetitions", "dakerHackathons")}
                for key in cache["sources"]
            ]
        }), encoding="utf-8")
        snapshot = json.loads((ROOT / "data/latest.json").read_text(encoding="utf-8"))
        audit = json.loads((ROOT / "data/research/2026-10-07.json").read_text(encoding="utf-8"))
        snapshot["date"] = "2026-10-11"
        audit["date"] = "2026-10-11"
        audit["completedAt"] = "2026-10-11T13:00:00+09:00"
        audit["publishedIds"] = []
        audit["reverifiedIds"] = []
        audit["reverificationEvidence"] = []
        audit["reverificationFailures"] = []
        audit["fixedSources"]["DACON"]["competitionsInventory"] = [
            {**{"title": x["title"], "url": x["url"]}, "disposition": "NOT_RELEVANT", "reason": "synthetic"}
            for x in cache["sources"]["daconCompetitions"]["actionableItems"]
        ]
        audit["fixedSources"]["DACON"]["dakerInventory"] = [
            {**{"title": x["title"], "url": x["url"]}, "disposition": "NOT_RELEVANT", "reason": "synthetic"}
            for x in cache["sources"]["dakerHackathons"]["actionableItems"]
        ]
        audit["machineSources"] = {
            key: [
                {"title": x["title"], "url": x["url"], "disposition": "NOT_RELEVANT", "reason": "synthetic"}
                for x in source["actionableItems"]
            ]
            for key, source in cache["sources"].items()
            if source["status"] == "OK" and key not in ("daconCompetitions", "dakerHackathons")
        }
        # Ensure this test does not depend on the old day's published IDs.
        for track in audit["tracks"].values():
            for candidate in track["rawCandidates"]:
                candidate.pop("id", None)
                if candidate.get("disposition") == "NOT_RELEVANT":
                    candidate.setdefault("reason", "synthetic")
        audit["fixedSources"]["Meetup"] = audit["fixedSources"].pop("Devpost/Meetup")
        data_path = directory / "snapshot.json"
        audit_path = directory / "audit.json"
        data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
        return data_path, audit_path, audit

    def validate(self, data_path, audit_path):
        return subprocess.run(
            [sys.executable, str(data_path.parent / "scripts/validate_research_audit.py"),
             str(audit_path), str(data_path)],
            cwd=data_path.parent, **UTF8_RUN,
        )

    def test_missing_distinct_query_item_is_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            data_path, audit_path, audit = self.make_fixture(Path(temp))
            ok = self.validate(data_path, audit_path)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            audit["machineSources"]["kStartupHighlights"].pop()
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            bad = self.validate(data_path, audit_path)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("kStartupHighlights crawler inventory not fully reviewed", bad.stderr)

    def test_draft_status_marker_is_blocked(self):
        # 2026-10-13 was promoted with a leftover "DRAFT_NOT_VALIDATED" marker.
        with tempfile.TemporaryDirectory() as temp:
            data_path, audit_path, audit = self.make_fixture(Path(temp))
            for status in ("DRAFT_NOT_VALIDATED", "IN_PROGRESS", ""):
                audit["status"] = status
                audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
                bad = self.validate(data_path, audit_path)
                self.assertNotEqual(bad.returncode, 0, status)
                self.assertIn("research audit status must be COMPLETE", bad.stderr)
            audit["status"] = "COMPLETE"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            ok = self.validate(data_path, audit_path)
            self.assertEqual(ok.returncode, 0, ok.stderr)

    def retarget(self, directory, data_path, audit_path, audit, day):
        """Move the fixture to another snapshot date with a matching cache."""
        snapshot = json.loads(data_path.read_text(encoding="utf-8"))
        cache = json.loads((directory / "data/source-cache/2026-10-11.json").read_text(encoding="utf-8"))
        snapshot["date"] = cache["date"] = audit["date"] = day
        audit["completedAt"] = f"{day}T13:00:00+09:00"
        (directory / f"data/source-cache/{day}.json").write_text(json.dumps(cache), encoding="utf-8")
        data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")

    def test_search_depth_requires_two_queries_per_axis_in_both_languages(self):
        # 2026-10-13 passed with one query per axis; from 10-14 each axis needs
        # two distinct queries, and each track Korean plus non-Korean variants.
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            for track in audit["tracks"].values():
                track["queriesByAxis"] = {
                    axis: [f"{axis} 공모전 모집 2026", f"{axis} hackathon 2026"]
                    for axis in track["queriesByAxis"]
                }
            self.retarget(directory, data_path, audit_path, audit, "2026-10-14")
            ok = self.validate(data_path, audit_path)
            self.assertEqual(ok.returncode, 0, ok.stderr)

            shallow = copy.deepcopy(audit)
            axis = next(iter(shallow["tracks"]["aiData"]["queriesByAxis"]))
            shallow["tracks"]["aiData"]["queriesByAxis"][axis] = [f"{axis} 공모전 모집 2026"] * 2
            audit_path.write_text(json.dumps(shallow, ensure_ascii=False), encoding="utf-8")
            bad = self.validate(data_path, audit_path)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn(f"aiData.{axis} needs at least 2 distinct queries", bad.stderr)

            korean_only = copy.deepcopy(audit)
            korean_only["tracks"]["aiNews"]["queriesByAxis"] = {
                axis: [f"{axis} 인기 글", f"{axis} 화제 토론"]
                for axis in korean_only["tracks"]["aiNews"]["queriesByAxis"]
            }
            audit_path.write_text(json.dumps(korean_only, ensure_ascii=False), encoding="utf-8")
            bad = self.validate(data_path, audit_path)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("aiNews needs both Korean and non-Korean query variants", bad.stderr)

    def test_material_change_cannot_skip_official_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            # All other items are historical/closed in this synthetic test;
            # the one non-due OPEN item should still need evidence if edited.
            for group in ("contests", "support"):
                for entry in baseline[group]:
                    entry["status"] = "CLOSED"
                for entry in snapshot[group]:
                    entry["status"] = "CLOSED"
            old = baseline["contests"][0]
            current = snapshot["contests"][0]
            old["status"] = current["status"] = "OPEN"
            old["lastVerifiedDate"] = current["lastVerifiedDate"] = "2026-10-10"
            old["deadlineText"] = current["deadlineText"] = "2026-12-31"
            current["reward"] = "Synthetic changed prize"
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            cmd = [
                sys.executable, str(directory / "scripts/validate_research_audit.py"),
                str(audit_path), str(data_path), str(baseline_path),
            ]
            bad = subprocess.run(cmd, cwd=directory, **UTF8_RUN)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("material opportunity changes require official re-verification", bad.stderr)

            current["lastVerifiedDate"] = "2026-10-11"
            current["lastUpdatedDate"] = "2026-10-11"
            audit["reverifiedIds"] = [old["id"]]
            audit["reverificationEvidence"] = [{
                "id": old["id"],
                "primarySourceUrl": "https://example.org/synthetic-only",
                "verifiedAt": "2026-10-11T13:00:00+09:00",
            }]
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            ok = subprocess.run(cmd, cwd=directory, **UTF8_RUN)
            self.assertEqual(ok.returncode, 0, ok.stderr)

            for bad_url, bad_stamp, expected_error in (
                ("not-a-url", "2026-10-11T13:00:00+09:00", "invalid primarySourceUrl"),
                ("https://not a hostname/research", "2026-10-11T13:00:00+09:00", "invalid primarySourceUrl"),
                ("https://exa%mple.org/x", "2026-10-11T13:00:00+09:00", "invalid primarySourceUrl"),
                ("https://-bad.example/x", "2026-10-11T13:00:00+09:00", "invalid primarySourceUrl"),
                ("https://example.org/real-shape", "yesterday", "invalid verifiedAt timestamp"),
                ("https://example.org/real-shape", "2026-10-10T13:00:00+09:00",
                 "verifiedAt must be on snapshot date in Asia/Seoul"),
                ("https://example.org/real-shape", "2026-10-11T13:00:00",
                 "verifiedAt must include a timezone"),
            ):
                audit["reverificationEvidence"][0]["primarySourceUrl"] = bad_url
                audit["reverificationEvidence"][0]["verifiedAt"] = bad_stamp
                audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
                result = subprocess.run(cmd, cwd=directory, **UTF8_RUN)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_error, result.stderr)

    def test_added_id_cannot_hide_behind_old_first_seen(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, _ = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            snapshot["aiDiscovery"].append({
                "id": "synthetic-unreported-item",
                "firstSeenDate": "2026-10-01",
                "title": "Synthetic test fixture only",
            })
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            bad = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("new ids must have firstSeenDate=", bad.stderr)

    def test_unvalidated_optional_track_cannot_supply_published_id(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            for group in ("contests", "support"):
                for row in snapshot[group]:
                    row["status"] = "CLOSED"
                for row in baseline[group]:
                    row["status"] = "CLOSED"
            new_id = "synthetic-unvalidated-track"
            snapshot["aiNews"].append({"id": new_id, "firstSeenDate": "2026-10-11"})
            audit["publishedIds"] = [new_id]
            audit["tracks"]["unchecked"] = {"rawCandidates": [{"id": new_id}]}
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            bad = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("every published id must appear in rawCandidates evidence", bad.stderr)

    def test_official_link_change_requires_reverification(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, _ = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            for group in ("contests", "support"):
                for entry in baseline[group]:
                    entry["status"] = "CLOSED"
                for entry in snapshot[group]:
                    entry["status"] = "CLOSED"
            original = baseline["contests"][0]
            edited = snapshot["contests"][0]
            original["status"] = edited["status"] = "OPEN"
            original["lastVerifiedDate"] = edited["lastVerifiedDate"] = "2026-10-10"
            original["deadlineText"] = edited["deadlineText"] = "2026-12-31"
            edited["links"] = [{"label": "changed", "url": "https://example.org/synthetic-only"}]
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            bad = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("material opportunity changes require official re-verification", bad.stderr)

    def test_closed_opportunity_reopening_requires_official_proof(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            for group in ("contests", "support"):
                for entry in baseline[group]:
                    entry["status"] = "CLOSED"
                for entry in snapshot[group]:
                    entry["status"] = "CLOSED"
            snapshot["contests"][0]["status"] = "OPEN"
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            bad = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("material opportunity changes require official re-verification", bad.stderr)

            reopened = snapshot["contests"][0]
            reopened["lastVerifiedDate"] = "2026-10-11"
            reopened["lastUpdatedDate"] = "2026-10-11"
            audit["reverifiedIds"] = [reopened["id"]]
            audit["reverificationEvidence"] = [{
                "id": reopened["id"],
                "primarySourceUrl": "https://example.org/synthetic-reopening",
                "verifiedAt": "2026-10-11T13:00:00+09:00",
            }]
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            good = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertEqual(good.returncode, 0, good.stderr)

    def test_summary_and_description_edits_require_official_proof(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, _ = self.make_fixture(directory)
            snapshot = json.loads(data_path.read_text(encoding="utf-8"))
            baseline = copy.deepcopy(snapshot)
            for group in ("contests", "support"):
                for entry in baseline[group]:
                    entry["status"] = "CLOSED"
                for entry in snapshot[group]:
                    entry["status"] = "CLOSED"
            before = baseline["contests"][0]
            after = snapshot["contests"][0]
            before["status"] = after["status"] = "OPEN"
            before["lastVerifiedDate"] = after["lastVerifiedDate"] = "2026-10-10"
            before["deadlineText"] = after["deadlineText"] = "2026-12-31"
            after["summary"] = "Synthetic unsupported registration claim"
            after["description"] = "Synthetic unsupported eligibility claim"
            baseline_path = directory / "baseline.json"
            baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            bad = subprocess.run(
                [sys.executable, str(directory / "scripts/validate_research_audit.py"),
                 str(audit_path), str(data_path), str(baseline_path)],
                cwd=directory, **UTF8_RUN,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("material opportunity changes require official re-verification", bad.stderr)

    def run_with_baseline(self, directory, data_path, audit_path, baseline):
        baseline_path = directory / "baseline.json"
        baseline_path.write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(directory / "scripts/validate_research_audit.py"),
             str(audit_path), str(data_path), str(baseline_path)],
            cwd=directory, **UTF8_RUN,
        )

    def closed_pair(self, data_path):
        snapshot = json.loads(data_path.read_text(encoding="utf-8"))
        baseline = copy.deepcopy(snapshot)
        for group in ("contests", "support"):
            for rows in (baseline[group], snapshot[group]):
                for entry in rows:
                    entry["status"] = "CLOSED"
        return snapshot, baseline

    def test_zero_actionable_needs_raw_items(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            cache_path = directory / "data/source-cache/2026-10-11.json"
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            cache["sources"]["daconCompetitions"]["actionableItems"] = []
            cache["sources"]["daconCompetitions"]["actionableCount"] = 0
            cache_path.write_text(json.dumps(cache), encoding="utf-8")
            audit["fixedSources"]["DACON"]["competitionsInventory"] = []
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            ok = self.validate(data_path, audit_path)
            self.assertEqual(ok.returncode, 0, ok.stderr)

            cache["sources"]["daconCompetitions"]["items"] = []
            cache_path.write_text(json.dumps(cache), encoding="utf-8")
            bad = self.validate(data_path, audit_path)
            self.assertNotEqual(bad.returncode, 0)

    def test_failed_reverification_with_reason_passes(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            snapshot, baseline = self.closed_pair(data_path)
            for rows in (baseline["contests"], snapshot["contests"]):
                rows[0].update(status="OPEN", lastVerifiedDate="2026-10-01", deadlineText="2026-12-31")
                rows[0]["links"] = [{"label": "Official", "url": "https://example.org/x"}]
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            item_id = snapshot["contests"][0]["id"]
            bad = self.run_with_baseline(directory, data_path, audit_path, baseline)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("did not re-verify", bad.stderr)

            audit["reverificationFailures"] = [{
                "id": item_id, "primarySourceUrl": "https://example.org/x", "reason": "HTTP 403",
            }]
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            ok = self.run_with_baseline(directory, data_path, audit_path, baseline)
            self.assertEqual(ok.returncode, 0, ok.stderr)

    def test_expired_out_of_scope_closes_without_official_proof(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, _ = self.make_fixture(directory)
            snapshot, baseline = self.closed_pair(data_path)
            old, new = baseline["contests"][0], snapshot["contests"][0]
            for row in (old, new):
                row.update(deadline=["2026-10-05"], lastVerifiedDate="2026-10-04")
                row["links"] = [{"label": "Official", "url": "https://x.devpost.com/"}]
            old["status"] = "OPEN"
            new["lastUpdatedDate"] = "2026-10-11"
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            ok = self.run_with_baseline(directory, data_path, audit_path, baseline)
            self.assertEqual(ok.returncode, 0, ok.stderr)

            for row in (old, new):
                row["links"] = [{"label": "Official", "url": "https://example.org/x"}]
            data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
            bad = self.run_with_baseline(directory, data_path, audit_path, baseline)
            self.assertNotEqual(bad.returncode, 0)

    def test_not_relevant_requires_reason(self):
        with tempfile.TemporaryDirectory() as temp:
            data_path, audit_path, audit = self.make_fixture(Path(temp))
            del audit["machineSources"]["kStartupHighlights"][0]["reason"]
            audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
            bad = self.validate(data_path, audit_path)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("NOT_RELEVANT requires a reason", bad.stderr)

    def test_opportunity_tracks_are_korean_only(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data_path, audit_path, audit = self.make_fixture(directory)
            for track_id, track in audit["tracks"].items():
                global_track = track_id in ("aiNews", "aiDiscovery")
                track["queriesByAxis"] = {
                    axis: [f"{axis} 공모전 모집", f"{axis} hackathon 2026" if global_track else f"{axis} 대회 2026"]
                    for axis in track["queriesByAxis"]
                }
            self.retarget(directory, data_path, audit_path, audit, "2026-10-14")
            ok = self.validate(data_path, audit_path)
            self.assertEqual(ok.returncode, 0, ok.stderr)


if __name__ == "__main__":
    unittest.main()
