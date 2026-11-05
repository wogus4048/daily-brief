#!/usr/bin/env python3
"""Regression tests for the local prepare and publish steps."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import daily_run
import free_explore

TODAY = "2026-11-05"
SOURCE_MANIFEST = {"active": [
    {"key": "daconCompetitions", "required": True},
    {"key": "contestKorea"},
]}


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value) + "\n").encode("utf-8"))


def source(status="OK", items=1, coverage=None):
    return {"status": status, "items": [{}] * items, "actionableItems": [], "coverage": coverage or []}


class ExploreTest(unittest.TestCase):
    class Client:
        def __init__(self, text="표\nhttps://example.go.kr/a, https://example.org/b.", fail=None):
            self.text, self.fail, self.cleaned = text, fail, []

        def open_chat(self, prompt):
            self.prompt = prompt
            return "session-1"

        def session(self, session_id):
            if self.fail:
                raise free_explore.ExploreFailed(self.fail)
            return {"conversationId": "prime-chat", "activeTurnId": None}

        def agents(self):
            return [
                {"role": "prime", "runId": "run", "conversationId": "prime-chat", "state": "active"},
                {"role": "worker", "runId": "run", "conversationId": "w1", "state": "sleeping"},
            ]

        def worker_answer(self, conversation_id):
            return self.text, free_explore.extract_urls(self.text)

        def cleanup(self, session_id):
            self.cleaned.append(session_id)

    def explore(self, client):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        write_json(root / "data/crawler-sources.json", {"active": [{"key": "wevity", "name": "위비티"}]})
        log = daily_run.RunLog(root, TODAY, "explore")
        return root, free_explore.run_explore(
            root, TODAY, log, client_factory=lambda: client, wait_seconds=1, poll_seconds=0,
        )

    def test_answer_is_saved_and_known_sites_excluded(self):
        client = self.Client()
        root, result = self.explore(client)
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["urls"], ["https://example.go.kr/a", "https://example.org/b"])
        self.assertIn("위비티", client.prompt)
        self.assertIn("한 번에 하나만", client.prompt)
        self.assertIn(TODAY, client.prompt)
        self.assertIn("https://example.go.kr/a", (root / result["answer"]).read_text(encoding="utf-8"))
        self.assertEqual(client.cleaned, ["session-1"])

    def test_failure_is_recorded_and_does_not_raise(self):
        client = self.Client(fail="Titan did not answer")
        _, result = self.explore(client)
        self.assertEqual(result["status"], "FAILED")
        self.assertIn("did not answer", result["reason"])
        self.assertEqual(client.cleaned, ["session-1"])

    def test_worker_report_comes_from_its_prime_messages(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "messages").mkdir()
            write_json(folder / "messages/a.json", {"kind": "assistant_message", "final": True, "seq": 9,
                                                    "renderedText": {"text": "Prime에 전달했습니다."}})
            rows = [
                {"kind": "tool_call", "tool": "agents", "args": {"text": json.dumps(
                    {"action": "message", "to": "prime", "text": "1 | https://x.go.kr/a | 주최"}, ensure_ascii=False)}},
                {"kind": "tool_call", "tool": "browser_tabs", "args": {"text": "{\"action\":\"list\"}"}},
                {"kind": "tool_call", "tool": "agents", "args": {"text": json.dumps(
                    {"action": "finish", "result": "RESULT 끝"}, ensure_ascii=False)}},
            ]
            (folder / "events.jsonl").write_text(
                "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8",
            )
            text, urls = free_explore.read_worker_report(folder)
            self.assertIn("1 | https://x.go.kr/a | 주최", text)
            self.assertIn("RESULT 끝", text)
            self.assertIn("Prime에 전달했습니다.", text)
            self.assertEqual(urls, ["https://x.go.kr/a"])

    def test_batches_fit_the_worker_limit(self):
        self.assertLessEqual(free_explore.VERIFY_WORKERS, 3)
        self.assertEqual(free_explore.BATCH_SIZE, free_explore.VERIFY_WORKERS * free_explore.ITEMS_PER_WORKER)

    def test_full_answer_comes_from_session_files(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            write_json(folder / "a.json", {"kind": "assistant_message", "final": True, "seq": 1,
                                           "renderedText": {"text": "old"}})
            write_json(folder / "b.json", {"kind": "assistant_message", "final": True, "seq": 2,
                                           "renderedText": {"text": "new"},
                                           "renderedHtml": {"text": "<a href=\"https://x.kr/1\">x</a>"}})
            self.assertEqual(free_explore.read_final_answer(folder), ("new", ["https://x.kr/1"]))


class VerifyTest(unittest.TestCase):
    class Client:
        def __init__(self, fail_on=None):
            self.prompts, self.cleaned, self.fail_on = [], [], fail_on

        def open_chat(self, prompt):
            self.prompts.append(prompt)
            if len(self.prompts) == self.fail_on:
                raise free_explore.ExploreFailed("chat did not open")
            return f"session-{len(self.prompts)}"

        def session(self, session_id):
            return {"conversationId": f"prime-{session_id}", "activeTurnId": None}

        def agents(self):
            current = f"session-{len(self.prompts)}"
            return [
                {"role": "prime", "runId": current, "conversationId": f"prime-{current}", "state": "active"},
                {"role": "worker", "runId": current, "conversationId": f"w-{current}", "state": "sleeping"},
                {"role": "worker", "runId": "naver", "conversationId": "other", "state": "active"},
            ]

        def worker_answer(self, conversation_id):
            return f"answer {conversation_id}", []

        def cleanup(self, session_id):
            self.cleaned.append(session_id)

    def verify(self, client):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        rows = [{"title": f"공고 {n}", "url": f"https://example.org/{n}"} for n in range(5)]
        write_json(root / f"data/source-cache/{TODAY}.json", {"sources": {
            "contestKorea": {"actionableItems": rows[:3]},
            "wevity": {"actionableItems": rows[2:]},
        }})
        log = daily_run.RunLog(root, TODAY, "verify")
        result = free_explore.run_verify(
            root, TODAY, log, client_factory=lambda: client, batch_size=2, wait_seconds=1, poll_seconds=0,
        )
        return root, result

    def test_items_are_deduplicated_batched_and_saved(self):
        client = self.Client()
        root, result = self.verify(client)
        self.assertEqual(result["items"], 5)
        self.assertEqual([batch["status"] for batch in result["batches"]], ["OK", "OK", "OK"])
        self.assertEqual(client.cleaned, ["session-1", "session-2", "session-3"])
        self.assertIn("answer w-session-3", (root / result["batches"][2]["answer"]).read_text(encoding="utf-8"))

    def test_prompt_demands_one_tab_and_retry(self):
        client = self.Client()
        self.verify(client)
        self.assertIn("한 번에 하나만", client.prompts[0])
        self.assertIn("다시 시도", client.prompts[0])
        self.assertIn("worker를 3개", client.prompts[0])
        self.assertIn("https://example.org/0", client.prompts[0])

    def test_failed_batch_does_not_stop_the_rest(self):
        client = self.Client(fail_on=2)
        _, result = self.verify(client)
        self.assertEqual([batch["status"] for batch in result["batches"]], ["OK", "FAILED", "OK"])
        self.assertEqual(result["status"], "PARTIAL")


class WorkerRunTest(unittest.TestCase):
    class Client:
        def __init__(self, polls, broken=()):
            self.polls, self.broken = list(polls), set(broken)

        def session(self, session_id):
            return {"conversationId": "prime-chat", "activeTurnId": None}

        def agents(self):
            return self.polls.pop(0) if len(self.polls) > 1 else self.polls[0]

        def worker_answer(self, conversation_id):
            if conversation_id in self.broken:
                raise free_explore.ExploreFailed("no answer")
            return f"answer {conversation_id}", ["https://example.org/a"]

    PRIME = {"role": "prime", "runId": "run", "conversationId": "prime-chat", "state": "active"}

    def worker(self, name, state):
        return {"role": "worker", "runId": "run", "conversationId": name, "state": state}

    def wait(self, client, seconds=1):
        with tempfile.TemporaryDirectory() as temp:
            log = daily_run.RunLog(Path(temp), TODAY, "verify")
            return free_explore.wait_for_workers(client, "s", seconds, 0, log)

    def test_waits_for_busy_workers(self):
        client = self.Client([
            [self.PRIME],
            [self.PRIME, self.worker("w1", "invited"), self.worker("w2", "active")],
            [self.PRIME, self.worker("w1", "sleeping"), self.worker("w2", "active")],
            [self.PRIME, self.worker("w1", "sleeping"), self.worker("w2", "finished")],
        ])
        self.assertEqual(self.wait(client), ["w1", "w2"])
        self.assertEqual(len(client.polls), 1)

    def test_parked_run_counts_as_finished(self):
        client = self.Client([[self.PRIME, self.worker("w1", "active")], []])
        self.assertEqual(self.wait(client), ["w1"])

    def test_no_worker_ever_started_fails(self):
        with self.assertRaises(free_explore.ExploreFailed):
            self.wait(self.Client([[self.PRIME]]), seconds=0)

    def test_answers_are_joined_and_a_missing_one_is_logged(self):
        client = self.Client([[self.PRIME, self.worker("w1", "sleeping"), self.worker("w2", "sleeping")]], broken={"w2"})
        client.open_chat = lambda prompt: "s"
        client.cleanup = lambda session_id: None
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log = daily_run.RunLog(root, TODAY, "verify")
            answer = root / "answer.md"
            session_id, urls, missing = free_explore.ask(client, "p", answer, 1, 0, log)
            self.assertEqual((session_id, urls, missing), ("s", ["https://example.org/a"], ["w2"]))
            self.assertIn("answer w1", answer.read_text(encoding="utf-8"))


class SourceReportTest(unittest.TestCase):
    def test_required_failure_stops(self):
        cache = {"date": TODAY, "sources": {"daconCompetitions": source("FAILED", 0), "contestKorea": source()}}
        report = daily_run.evaluate_sources(cache, SOURCE_MANIFEST, TODAY)
        self.assertEqual(report["requiredFailed"], ["daconCompetitions"])

    def test_optional_failure_and_unfinished_listing_only_warn(self):
        unfinished = [{"url": "https://example.org/a", "reachedEnd": False, "pagesRead": 3, "stoppedBy": "limit"}]
        cache = {"date": TODAY, "sources": {
            "daconCompetitions": source(), "contestKorea": source("FAILED", 0, unfinished),
        }}
        report = daily_run.evaluate_sources(cache, SOURCE_MANIFEST, TODAY)
        self.assertEqual(report["requiredFailed"], [])
        self.assertEqual(report["failed"], ["contestKorea"])
        self.assertEqual(report["unfinished"], ["contestKorea: https://example.org/a stopped at page 3 (limit)"])

    def test_old_cache_stops(self):
        cache = {"date": "2026-11-04", "sources": {"daconCompetitions": source()}}
        self.assertEqual(daily_run.evaluate_sources(cache, SOURCE_MANIFEST, TODAY)["requiredFailed"], ["cacheDate"])


class RepoCase(unittest.TestCase):
    def setUp(self):
        # Windows can briefly lock git's sample hooks, which is no test failure.
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.origin = base / "origin.git"
        self.root = base / "work"
        git(base, "init", "--bare", "-b", "main", str(self.origin))
        git(base, "init", "-b", "main", str(self.root))
        git(self.root, "config", "user.email", "test@example.org")
        git(self.root, "config", "user.name", "test")
        git(self.root, "config", "core.autocrlf", "false")
        git(self.root, "remote", "add", "origin", str(self.origin))
        write_json(self.root / "data/latest.json", {"date": "2026-11-04", "contests": [], "support": []})
        write_json(self.root / "data/crawler-sources.json", SOURCE_MANIFEST)
        (self.root / "README.md").write_text("x\n", encoding="utf-8")
        git(self.root, "add", ".")
        git(self.root, "commit", "-m", "base")
        git(self.root, "push", "origin", "main")

    def origin_file(self, path):
        return git(self.origin, "show", f"main:{path}")

    def report(self):
        return json.loads((self.root / f"artifacts/daily/{TODAY}.json").read_text(encoding="utf-8"))

    def events(self):
        path = self.root / f"artifacts/daily/{TODAY}.log.jsonl"
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


class PrepareTest(RepoCase):
    def crawl_with(self, sources):
        def crawl(root, log):
            write_json(root / f"data/source-cache/{TODAY}.json", {"date": TODAY, "sources": sources})
            return 0
        return crawl

    def test_required_failure_stops_and_records(self):
        code = daily_run.run_prepare(
            self.root, TODAY, no_pull=True, deps=lambda root, log: None,
            crawl=self.crawl_with({"daconCompetitions": source("FAILED", 0), "contestKorea": source()}),
        )
        self.assertEqual(code, 1)
        self.assertEqual(self.report()["prepare"]["status"], "FAILED")
        self.assertIn("daconCompetitions", self.report()["prepare"]["reason"])

    def test_expired_devpost_is_closed(self):
        write_json(self.root / "data/latest.json", {"date": "2026-11-04", "support": [], "contests": [{
            "id": "gone", "status": "OPEN", "deadlineText": "10.31",
            "links": [{"url": "https://x.devpost.com/"}],
        }]})
        code = daily_run.run_prepare(
            self.root, TODAY, no_pull=True, deps=lambda root, log: None,
            crawl=self.crawl_with({"daconCompetitions": source(), "contestKorea": source()}),
        )
        self.assertEqual(code, 0)
        snapshot = json.loads((self.root / "data/latest.json").read_text(encoding="utf-8"))
        self.assertEqual(snapshot["contests"][0]["status"], "CLOSED")
        self.assertEqual(self.report()["prepare"]["closedOutOfScope"], ["gone"])

    def test_sync_needs_dedicated_folder(self):
        (self.root / "README.md").write_text("edited\n", encoding="utf-8")
        with self.assertRaises(daily_run.StepFailed):
            daily_run.sync_main(self.root)
        self.assertEqual((self.root / "README.md").read_text(encoding="utf-8"), "edited\n")

        (self.root / daily_run.RUNNER_MARKER).write_text("", encoding="utf-8")
        daily_run.sync_main(self.root)
        self.assertEqual((self.root / "README.md").read_text(encoding="utf-8"), "x\n")

    def test_log_keeps_sources_and_earlier_attempts(self):
        crawl = self.crawl_with({"daconCompetitions": source(), "contestKorea": source("FAILED", 0)})
        options = dict(no_pull=True, deps=lambda root, log: None, crawl=crawl)
        self.assertEqual(daily_run.run_prepare(self.root, TODAY, **options), 0)
        self.assertEqual(daily_run.run_prepare(self.root, TODAY, **options), 0)
        events = self.events()
        self.assertEqual([e["event"] for e in events].count("run_start"), 2)
        sources = next(e for e in events if e["event"] == "sources")["sources"]
        self.assertEqual(sources["contestKorea"]["status"], "FAILED")
        stage = next(e for e in events if e["event"] == "stage_end" and e["stage"] == "crawl")
        self.assertIn("seconds", stage)

    def test_unexpected_error_is_recorded_with_traceback(self):
        def broken(root, log):
            raise ValueError("surprise")

        code = daily_run.run_prepare(self.root, TODAY, no_pull=True, deps=lambda root, log: None, crawl=broken)
        self.assertEqual(code, 1)
        self.assertIn("surprise", self.report()["prepare"]["reason"])
        failure = next(e for e in self.events() if e["event"] == "run_failed")
        self.assertIn("ValueError", failure["traceback"])

    def test_command_output_is_saved(self):
        log = daily_run.RunLog(self.root, TODAY, "publish")
        code, tail = daily_run.run_command(log, "probe", [sys.executable, "-c", "print('hello'); raise SystemExit(3)"], self.root)
        self.assertEqual(code, 3)
        self.assertIn("hello", tail)
        event = next(e for e in self.events() if e["event"] == "command")
        self.assertEqual(event["exitCode"], 3)
        self.assertIn("hello", (self.root / event["output"]).read_text(encoding="utf-8"))


class PublishTest(RepoCase):
    def write_brief(self, date=TODAY):
        snapshot = {"date": date, "contests": [], "support": []}
        write_json(self.root / "data/latest.json", snapshot)
        write_json(self.root / f"data/archive/{date}.json", snapshot)
        write_json(self.root / f"data/research/{date}.json", {"date": date})
        write_json(self.root / f"data/source-cache/{date}.json", {"date": date})
        write_json(self.root / "data/source-cache/latest.json", {"date": date})

    def publish(self, **overrides):
        options = dict(
            checks=lambda root, date, baseline, log: None,
            fetch_public=lambda: subprocess.run(
                ["git", "show", "main:data/latest.json"], cwd=self.origin, check=True, capture_output=True,
            ).stdout,
            wait_seconds=0,
        )
        options.update(overrides)
        return daily_run.run_publish(self.root, TODAY, **options)

    def test_good_brief_reaches_main(self):
        self.write_brief()
        (self.root / ".claude").mkdir()
        (self.root / ".claude/leftover").write_text("x", encoding="utf-8")
        self.assertEqual(self.publish(), 0)
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], TODAY)
        self.assertEqual(json.loads(self.origin_file(f"data/source-cache/{TODAY}.json"))["date"], TODAY)
        self.assertEqual(self.report()["publish"]["status"], "OK")

    def test_other_tracked_change_is_refused(self):
        self.write_brief()
        (self.root / "README.md").write_text("edited\n", encoding="utf-8")
        self.assertEqual(self.publish(), 1)
        self.assertIn("README.md", self.report()["publish"]["reason"])
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], "2026-11-04")

    def test_wrong_dates_are_refused(self):
        self.write_brief("2026-11-03")
        self.assertEqual(self.publish(), 1)
        self.assertIn("older", self.report()["publish"]["reason"])

        self.write_brief("2026-11-04")
        self.assertEqual(self.publish(), 1)
        self.assertIn("today", self.report()["publish"]["reason"])

    def test_archive_mismatch_is_refused(self):
        self.write_brief()
        write_json(self.root / f"data/archive/{TODAY}.json", {"date": TODAY, "other": True})
        self.assertEqual(self.publish(checks=daily_run.check_files), 1)
        self.assertIn("archive", self.report()["publish"]["reason"])
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], "2026-11-04")

    def test_archive_line_endings_do_not_matter(self):
        self.write_brief()
        archive = self.root / f"data/archive/{TODAY}.json"
        archive.write_bytes(archive.read_bytes().replace(b"\n", b"\r\n"))
        self.assertEqual(self.publish(checks=daily_run.check_files), 0)

    def test_failed_check_does_not_push(self):
        self.write_brief()

        def failing(root, date, baseline, log):
            raise daily_run.StepFailed("validator failed")

        self.assertEqual(self.publish(checks=failing), 1)
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], "2026-11-04")

    def test_no_push_stops_after_checks(self):
        self.write_brief()
        self.assertEqual(self.publish(no_push=True), 0)
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], "2026-11-04")
        self.assertEqual(self.report()["publish"]["status"], "CHECKED")

    def test_only_main_can_push(self):
        git(self.root, "checkout", "-b", "feature")
        self.write_brief()
        self.assertEqual(self.publish(), 1)
        self.assertIn("main", self.report()["publish"]["reason"])

    def test_public_mismatch_fails(self):
        self.write_brief()
        self.assertEqual(self.publish(fetch_public=lambda: b"old"), 1)
        self.assertIn("public", self.report()["publish"]["reason"])
        checks = [e for e in self.events() if e["event"] == "public_check"]
        self.assertFalse(checks[-1]["matched"])
        self.assertIn("expected", checks[-1])

    def test_concurrent_main_change_is_rebased(self):
        other = Path(self.temp.name) / "other"
        git(self.temp.name, "clone", str(self.origin), str(other))
        git(other, "config", "user.email", "test@example.org")
        git(other, "config", "user.name", "test")
        (other / "metrics.json").write_text("{}\n", encoding="utf-8")
        git(other, "add", ".")
        git(other, "commit", "-m", "metrics")
        git(other, "push", "origin", "HEAD:main")

        self.write_brief()
        self.assertEqual(self.publish(), 0)
        self.assertEqual(self.origin_file("metrics.json"), "{}\n")
        self.assertEqual(json.loads(self.origin_file("data/latest.json"))["date"], TODAY)


if __name__ == "__main__":
    unittest.main()
