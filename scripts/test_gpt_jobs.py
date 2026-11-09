#!/usr/bin/env python3
"""GPT research stages: one test per behaviour the 2026-11-09 design requires."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import gpt_jobs
from assemble_brief import assemble
from research_rules import is_reverification_due, normalize_url

ROOT = Path(__file__).resolve().parents[1]
UTF8_RUN = dict(capture_output=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})
TODAY = "2026-11-09"


class FakeLog:
    def event(self, *args, **kwargs):
        pass


def answer_block(rows):
    return "```json\n" + "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n```"


class NumberedTest(unittest.TestCase):
    def test_missing_numbers_are_resent_once_then_left_missing(self):
        # Goal 6: 11-06 and 11-09 lost the third worker's items while the report said nothing was missing.
        calls = []

        def fake_chat(client, prompt, path, log, wait, poll):
            calls.append(prompt)
            if len(calls) == 1:  # 10 items, workers answer only 1-6
                return [{"n": n} for n in range(1, 7)], {}
            if len(calls) == 2:  # resend of 4 items: answer the first three
                return [{"n": n} for n in range(1, 4)], {}
            return [], {}

        client = type("C", (), {"user_data": Path("nowhere")})()
        original = gpt_jobs.run_chat
        gpt_jobs.run_chat = fake_chat
        try:
            items = [f"item{i}" for i in range(10)]
            answers, batches = gpt_jobs.run_numbered(client, items, lambda chunk: "\n".join(chunk),
                                                     Path(tempfile.gettempdir()) / "x", FakeLog(), 0, 0)
        finally:
            gpt_jobs.run_chat = original
        self.assertEqual(len(calls), 2)
        self.assertIn("item6", calls[1])  # the resend carries the original items, numbered from 1
        self.assertEqual(sorted(answers), list(range(9)))
        self.assertEqual([b["missingItems"] for b in batches], [4, 1])


class ParseTest(unittest.TestCase):
    def test_json_lines_survive_split_and_resent_messages(self):
        text = (answer_block([{"n": 1}, {"n": 2}]) + "\n\n## worker 2\n" + answer_block([{"n": 2}])
                + "\n```json\n{\"n\": 3}\n{broken\n```")
        rows, bad = gpt_jobs.parse_lines(text)
        self.assertEqual([r["n"] for r in rows], [1, 2, 3])
        self.assertEqual(len(bad), 1)


class WorkerReportTest(unittest.TestCase):
    def test_batched_messages_to_prime_are_read(self):
        # 2026-11-09: workers sent {"messages":[...]} and every such answer was dropped.
        from free_explore import read_worker_report
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            calls = [
                {"action": "message", "to": "prime", "text": answer_block([{"n": 1}])},
                {"action": "message", "messages": [{"to": "prime", "text": answer_block([{"n": 2}])},
                                                   {"to": "worker-2", "text": "not for prime"}]},
            ]
            with (folder / "events.jsonl").open("w", encoding="utf-8") as events:
                for args in calls:
                    events.write(json.dumps({"kind": "tool_call", "call": {"tool": "agents",
                                             "args": {"text": json.dumps(args, ensure_ascii=False)}}}) + "\n")
            text, _ = read_worker_report(folder)
        rows, _ = gpt_jobs.parse_lines(text)
        self.assertEqual([r["n"] for r in rows], [1, 2])
        self.assertNotIn("not for prime", text)


class StuckChatTest(unittest.TestCase):
    def test_chat_without_workers_fails_fast(self):
        # Goal 7: on 2026-11-09 a chat that never started its workers held the run for 30 minutes.
        import free_explore

        class Idle:
            def session(self, session_id):
                return {"conversationId": "c", "activeTurnId": "t"}

            def agents(self):
                return []

        original = free_explore.SPAWN_SECONDS
        free_explore.SPAWN_SECONDS = 0
        try:
            with self.assertRaisesRegex(free_explore.ExploreFailed, "no worker started"):
                free_explore.wait_for_workers(Idle(), "s", 1800, 0, FakeLog())
        finally:
            free_explore.SPAWN_SECONDS = original


class PromptTest(unittest.TestCase):
    def test_find_prompt_lists_annual_contests_and_new_listing_pages(self):
        # Goal 5: recurring contests and newly learned listing pages are checked every run.
        jobs = dict(gpt_jobs.find_jobs(ROOT, TODAY))
        annual = json.loads((ROOT / "data/annual-contests.json").read_text(encoding="utf-8"))["contests"]
        for contest in annual:
            self.assertIn(contest["url"], jobs["find-b"])
        manifest = json.loads((ROOT / "data/crawler-sources.json").read_text(encoding="utf-8"))
        with_url = [c for c in manifest["nextCandidates"] if c.get("url")]
        if with_url:
            newest = max(with_url, key=lambda c: c.get("discoveredAt") or "")
            self.assertIn(newest["url"], jobs["find-b"])
        for name in gpt_jobs.FIXED_SOURCES:
            self.assertIn(f'"{name}"', jobs["find-b"])


class CandidateTest(unittest.TestCase):
    def test_open_items_are_skipped_but_a_closed_round_is_not(self):
        # Goal 4/5: ContestKorea titles are cleaned before matching; a CLOSED card's URL can carry a new round.
        latest = json.loads((ROOT / "data/archive/2026-11-06.json").read_text(encoding="utf-8"))
        open_item = next(x for x in latest["contests"] if x["id"] == "hana-securities-youth-finance-idea-2026")
        closed = next(x for x in latest["contests"] if x["id"] == "ai-top-100-2026")
        details = [
            {"source": "contestKorea", "title": "아이디어•건축•창업 " + open_item["title"] + " 0",
             "url": "https://www.contestkorea.com/sub/view.php?str_no=1"},
            {"source": "gpt", "title": "AI TOP 100 2027", "url": closed["links"][0]["url"]},
        ]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "data").mkdir()
            (root / "data/latest.json").write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
            rows, decided = gpt_jobs.build_candidates(root, TODAY, details, [], {})
        self.assertEqual([r["title"] for r in rows], ["AI TOP 100 2027"])
        self.assertEqual(decided[0]["disposition"], "EXISTING")


class AssembleTest(unittest.TestCase):
    def build(self, root, with_records=True):
        for name in ("validate_data.py", "validate_research_audit.py", "research_rules.py"):
            (root / "scripts").mkdir(exist_ok=True)
            shutil.copy(ROOT / "scripts" / name, root / "scripts" / name)
        for folder in ("data/archive", "data/research", "data/source-cache", "artifacts/daily"):
            (root / folder).mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f"data/source-cache/{TODAY}.json", root / f"data/source-cache/{TODAY}.json")
        # The fixture cache is from 2026-11-09; sources added later are not in it.
        manifest = json.loads((ROOT / "data/crawler-sources.json").read_text(encoding="utf-8"))
        cached = json.loads((ROOT / f"data/source-cache/{TODAY}.json").read_text(encoding="utf-8"))["sources"]
        manifest["active"] = [e for e in manifest["active"] if e["key"] in cached]
        (root / "data/crawler-sources.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        baseline = json.loads((ROOT / "data/archive/2026-11-06.json").read_text(encoding="utf-8"))
        (root / "data/latest.json").write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
        (root / "baseline.json").write_text(json.dumps(baseline, ensure_ascii=False), encoding="utf-8")
        cache = json.loads((root / f"data/source-cache/{TODAY}.json").read_text(encoding="utf-8"))
        candidates = [{"source": key, "title": item.get("title") or item["url"], "url": item["url"]}
                      for key, source in cache["sources"].items() for item in source.get("actionableItems") or []]
        check = {str(i): {"n": i + 1, "disposition": "NOT_RELEVANT", "reason": "시험", "track": "publicIdea"}
                 for i in range(len(candidates))}
        check["0"] = {"n": 1, "disposition": "PUBLISHED", "official": False, "track": "aiData", "card": {
            "id": "test-card-2026", "title": "시험 공모전", "summary": "시험", "categoryLabel": "공모전 · 개발",
            "deadline": ["2026-11-30"], "deadlineText": "11.30", "links": [{"label": "공식", "url": "https://example.org/a"}]}}
        due = [x["id"] for g in ("contests", "support") for x in baseline[g]
               if x.get("status") in ("OPEN", "UPCOMING") and is_reverification_due(x, TODAY)]
        rows = []
        if with_records:
            for track, axes in gpt_jobs.TRACK_AXES.items():
                for axis in axes:
                    rows.append({"kind": "queries", "track": track, "axis": axis,
                                 "queries": [f"{axis} 공모전", f"{axis} hackathon"]})
            rows += [{"kind": "fixedSource", "name": n, "urls": [u], "status": "CHECKED", "note": "시험"}
                     for n, u in gpt_jobs.FIXED_SOURCES.items()]
            rows += [{"kind": "district", "key": k, "urls": ["https://www.nowon.kr/"], "status": "CHECKED", "note": "시험"}
                     for k in gpt_jobs.DISTRICTS]
        news = [{"kind": "aiNews", "card": {"id": "test-news", "title": "시험 뉴스", "summary": "시험", "description": "d",
                                            "why": "w", "tags": ["t"], "ideas": ["i"],
                                            "links": [{"label": "원문", "url": "https://example.org/n"}]}}]
        state = {"find": {"rows": rows}, "news": {"rows": news}, "candidates": candidates, "decided": [],
                 "check": {"answers": check}, "due": due,
                 "reverify": {"answers": {str(i): {"n": i + 1, "result": "VERIFIED", "primarySourceUrl": "https://example.org/v",
                                                   "note": "시험", "changes": {}} for i in range(len(due))},
                              "checkedAt": "2026-11-09T10:00:00+09:00"}}
        if not with_records:  # user decision 2026-11-09: existing items are not re-checked
            state["reverify"] = {"skipped": "재확인 생략"}
        (root / f"artifacts/daily/{TODAY}-gpt.json").write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")

    def validate(self, root):
        data = subprocess.run([sys.executable, str(root / "scripts/validate_data.py"), str(root / "data/latest.json")],
                              **UTF8_RUN)
        audit = subprocess.run([sys.executable, str(root / "scripts/validate_research_audit.py"),
                                str(root / f"data/research/{TODAY}.json"), str(root / "data/latest.json"),
                                str(root / "baseline.json")], **UTF8_RUN)
        return data, audit

    def test_assembled_brief_passes_and_missing_records_are_failed_not_invented(self):
        # Goal 4 with user decision 2: a brief built only from GPT results passes, also when records are missing.
        for with_records in (True, False):
            with self.subTest(with_records=with_records), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.build(root, with_records)
                summary = assemble(root, TODAY)
                data, audit = self.validate(root)
                self.assertEqual(data.returncode, 0, data.stderr)
                self.assertEqual(audit.returncode, 0, audit.stderr)
                latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
                card = next(x for x in latest["contests"] if x["id"] == "test-card-2026")
                self.assertEqual(card["officialCheck"], "PENDING")
                self.assertEqual(summary["pendingOfficial"], 1)
                if not with_records:
                    self.assertTrue(summary["failedRecords"])


if __name__ == "__main__":
    unittest.main()
