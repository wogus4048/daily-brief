#!/usr/bin/env python3
"""Regression tests for research gating; synthetic fixtures never get published."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from research_rules import is_reverification_due, nearest_deadline_date, normalize_url, parse_seoul_date
from research_worklist import build_worklist

ROOT = Path(__file__).resolve().parents[1]


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

    def test_deadline_priority_and_no_false_rollover(self):
        today = date(2026, 10, 11)
        item = {"deadlineText": "10.24 04:00 KST", "period": "접수 10.01~10.23"}
        self.assertEqual(nearest_deadline_date(item, today), date(2026, 10, 24))
        self.assertEqual(nearest_deadline_date({"deadlineText": "10.08 16:00", "period": "행사 10.30"}, today), date(2026, 10, 8))
        self.assertIsNone(nearest_deadline_date({"deadlineText": "승인제 접수 중", "period": "행사 10.24"}, today))
        self.assertEqual(nearest_deadline_date({"deadlineText": "10.10 / 10.20"}, today), date(2026, 10, 20))
        self.assertEqual(nearest_deadline_date({"deadlineText": "01.02"}, date(2026, 12, 31)), date(2027, 1, 2))

    def test_risk_cadence_and_seoul_timezone(self):
        self.assertEqual(parse_seoul_date("2026-10-10T16:00:00Z"), date(2026, 10, 11))
        self.assertTrue(is_reverification_due(
            {"status": "OPEN", "lastVerifiedDate": "2026-10-10", "deadlineText": "10.10"}, "2026-10-11"
        ))
        self.assertFalse(is_reverification_due(
            {"status": "OPEN", "lastVerifiedDate": "2026-10-10", "deadlineText": "10.24"}, "2026-10-11"
        ))
        self.assertTrue(is_reverification_due(
            {"status": "UPCOMING", "lastVerifiedDate": "2026-10-10", "openingAt": "2026-10-12T08:00:00+09:00"},
            "2026-10-11",
        ))

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
            sample_cache = json.loads((root / "data/source-cache/2026-10-11.json").read_text())
            fixture_manifest = {
                "active": [
                    {"key": key, "required": key in ("daconCompetitions", "dakerHackathons")}
                    for key in sample_cache["sources"]
                ]
            }
            (root / "data/crawler-sources.json").write_text(json.dumps(fixture_manifest))
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
        cache = json.loads((ROOT / "data/source-cache/2026-10-11.json").read_text())
        (directory / "scripts").mkdir()
        (directory / "data/source-cache").mkdir(parents=True)
        for name in ("validate_research_audit.py", "research_rules.py"):
            (directory / "scripts" / name).write_bytes((ROOT / "scripts" / name).read_bytes())
        (directory / "data/source-cache/2026-10-11.json").write_text(json.dumps(cache))
        (directory / "data/crawler-sources.json").write_text(json.dumps({
            "active": [
                {"key": key, "required": key in ("daconCompetitions", "dakerHackathons")}
                for key in cache["sources"]
            ]
        }))
        snapshot = json.loads((ROOT / "data/latest.json").read_text())
        audit = json.loads((ROOT / "data/research/2026-10-07.json").read_text())
        snapshot["date"] = "2026-10-11"
        audit["date"] = "2026-10-11"
        audit["completedAt"] = "2026-10-11T13:00:00+09:00"
        audit["publishedIds"] = []
        audit["reverifiedIds"] = []
        audit["reverificationEvidence"] = []
        audit["reverificationFailures"] = []
        audit["fixedSources"]["DACON"]["competitionsInventory"] = [
            {**{"title": x["title"], "url": x["url"]}, "disposition": "NOT_RELEVANT"}
            for x in cache["sources"]["daconCompetitions"]["actionableItems"]
        ]
        audit["fixedSources"]["DACON"]["dakerInventory"] = [
            {**{"title": x["title"], "url": x["url"]}, "disposition": "NOT_RELEVANT"}
            for x in cache["sources"]["dakerHackathons"]["actionableItems"]
        ]
        audit["machineSources"] = {
            key: [
                {"title": x["title"], "url": x["url"], "disposition": "NOT_RELEVANT"}
                for x in source["actionableItems"]
            ]
            for key, source in cache["sources"].items()
            if source["status"] == "OK" and key not in ("daconCompetitions", "dakerHackathons")
        }
        # Ensure this test does not depend on the old day's published IDs.
        for track in audit["tracks"].values():
            for candidate in track["rawCandidates"]:
                candidate.pop("id", None)
        data_path = directory / "snapshot.json"
        audit_path = directory / "audit.json"
        data_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        audit_path.write_text(json.dumps(audit, ensure_ascii=False), encoding="utf-8")
        return data_path, audit_path, audit

    def validate(self, data_path, audit_path):
        return subprocess.run(
            [sys.executable, str(data_path.parent / "scripts/validate_research_audit.py"),
             str(audit_path), str(data_path)],
            cwd=data_path.parent, capture_output=True, text=True,
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
            bad = subprocess.run(cmd, cwd=directory, capture_output=True, text=True)
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
            ok = subprocess.run(cmd, cwd=directory, capture_output=True, text=True)
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
                result = subprocess.run(cmd, cwd=directory, capture_output=True, text=True)
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
                cwd=directory, capture_output=True, text=True,
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
                cwd=directory, capture_output=True, text=True,
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
                cwd=directory, capture_output=True, text=True,
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
                cwd=directory, capture_output=True, text=True,
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
                cwd=directory, capture_output=True, text=True,
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
                cwd=directory, capture_output=True, text=True,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("material opportunity changes require official re-verification", bad.stderr)


if __name__ == "__main__":
    unittest.main()
