#!/usr/bin/env python3
"""Fixed local steps around the daily Claude run.

prepare: refresh main, check dependencies, close expired out-of-scope items, crawl.
research: GPT workers find, check, re-verify and write; a program assembles the brief
  (docs/superpowers/specs/2026-11-09-gpt-research-design.md).
publish: check the brief, push it straight to main, confirm the public site.
all: prepare, research, publish in one run.

Everything needed to debug or improve a run stays in artifacts/daily/ (not in git):
  YYYY-MM-DD.json             latest outcome of each step
  YYYY-MM-DD.log.jsonl        every attempt in time order, with stages and timings
  YYYY-MM-DD-<name>.log       full output of each command
"""

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
import urllib.request
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import code_cards
import gpt_jobs
from assemble_brief import assemble
from free_explore import POLL_SECONDS, WAIT_SECONDS, ExploreFailed, TitanClient, earlier_decisions, run_explore, run_verify
from read_details import write_details
from research_rules import apply_deadlines, close_expired_out_of_scope, is_reverification_due

ROOT = Path(__file__).resolve().parents[1]
SEOUL = ZoneInfo("Asia/Seoul")
PUBLIC_LATEST_URL = "https://wogus4048.github.io/daily-brief/data/latest.json"
# Only the dedicated runner clone holds this file. sync_main discards local
# work, so it must never run in a development checkout.
RUNNER_MARKER = ".daily-brief-runner"
PUSH_ATTEMPTS = 3
PUBLIC_WAIT_SECONDS = 600
PUBLIC_POLL_SECONDS = 15
OUTPUT_TAIL_CHARS = 2000
TITAN_EXE = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Titan/Titan.exe"
CHROME_EXE = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
# This project's own Chrome profile with the Titan extension (not the Naver one; findings 2026-11-09).
CHROME_PROFILE = Path(r"D:\daily-brief-ops\chrome-titan")
BROWSER_WAIT_SECONDS = 120


class StepFailed(Exception):
    pass


class RunLog:
    def __init__(self, root, date, step):
        self.root = root
        self.date = date
        self.step = step
        self.directory = root / "artifacts/daily"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / f"{date}.log.jsonl"

    def event(self, event, **fields):
        row = {"at": datetime.now(SEOUL).isoformat(), "step": self.step, "event": event, **fields}
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    @contextmanager
    def stage(self, name):
        started = time.monotonic()
        self.event("stage_start", stage=name)
        try:
            yield
        except BaseException as error:
            self.event("stage_end", stage=name, ok=False, seconds=round(time.monotonic() - started, 1), error=str(error))
            raise
        self.event("stage_end", stage=name, ok=True, seconds=round(time.monotonic() - started, 1))


def run_command(log, name, command, root, env=None):
    output = log.directory / f"{log.date}-{name}.log"
    started = time.monotonic()
    with output.open("ab") as handle:
        handle.write(f"\n=== {datetime.now(SEOUL).isoformat()} {' '.join(map(str, command))}\n".encode("utf-8"))
        handle.flush()
        code = subprocess.run(command, cwd=root, env=env, stdout=handle, stderr=subprocess.STDOUT).returncode
    tail = output.read_bytes()[-OUTPUT_TAIL_CHARS:].decode("utf-8", "replace")
    log.event(
        "command", name=name, command=[str(part) for part in command], exitCode=code,
        seconds=round(time.monotonic() - started, 1), output=output.relative_to(root).as_posix(),
    )
    return code, tail


def git(root, *args, check=True):
    result = subprocess.run(["git", *args], cwd=root, capture_output=True)
    if check and result.returncode:
        message = result.stderr.decode("utf-8", "replace").strip()
        raise StepFailed(f"git {' '.join(args)} failed: {message}")
    return result


def git_text(root, *args):
    return git(root, *args).stdout.decode("utf-8", "replace").strip()


def write_report(root, date, step, result):
    path = root / f"artifacts/daily/{date}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    report = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"date": date}
    report[step] = {**result, "finishedAt": datetime.now(SEOUL).isoformat()}
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def log_environment(log, root, arguments):
    tool_version = lambda name: (
        subprocess.run([name, "--version"], capture_output=True).stdout.decode("utf-8", "replace").strip()
        if shutil.which(name) else None
    )
    log.event(
        "run_start",
        arguments=arguments,
        commit=git(root, "rev-parse", "HEAD", check=False).stdout.decode("utf-8", "replace").strip(),
        branch=git(root, "rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.decode("utf-8", "replace").strip(),
        python=sys.version.split()[0],
        node=tool_version("node"),
    )


def finish_failed(log, result, name, error):
    result["reason"] = str(error)
    log.event("run_failed", reason=str(error), traceback=traceback.format_exc())
    print(f"{name} failed: {error}", file=sys.stderr)
    return 1


def evaluate_sources(cache, manifest, today):
    sources = cache.get("sources", {})
    active = [entry for entry in manifest.get("active", []) if entry.get("status") != "DEGRADED"]
    healthy = lambda key: sources.get(key, {}).get("status") == "OK" and sources[key].get("items")
    required_failed = [entry["key"] for entry in active if entry.get("required") and not healthy(entry["key"])]
    if cache.get("date") != today:
        required_failed.append("cacheDate")
    unfinished = [
        f"{entry['key']}: {listing.get('url')} stopped at page {listing.get('pagesRead')} ({listing.get('stoppedBy')})"
        for entry in active
        for listing in sources.get(entry["key"], {}).get("coverage") or []
        if not listing.get("reachedEnd")
    ]
    return {
        "requiredFailed": required_failed,
        "failed": [entry["key"] for entry in active if not healthy(entry["key"])],
        "unfinished": unfinished,
    }


def source_stats(cache):
    return {
        key: {
            "status": value.get("status"),
            "count": value.get("count"),
            "actionableCount": value.get("actionableCount"),
            "error": value.get("error"),
            "coverage": value.get("coverage"),
        }
        for group in ("sources", "shadowSources")
        for key, value in cache.get(group, {}).items()
    }


def sync_main(root):
    if not (root / RUNNER_MARKER).exists():
        raise StepFailed(f"{RUNNER_MARKER} is missing: refusing to discard local work; use --no-pull here")
    git(root, "fetch", "origin", "main")
    git(root, "checkout", "-f", "-B", "main", "origin/main")
    git(root, "reset", "--hard", "origin/main")
    git(root, "clean", "-fd", "data")


def check_dependencies(root, log):
    if importlib.util.find_spec("tzdata") is None:
        raise StepFailed("Python package tzdata is missing")
    if not (root / "node_modules/playwright").exists():
        npm = shutil.which("npm")
        if not npm:
            raise StepFailed("npm is missing")
        # npm ci leaves package-lock.json untouched, which publish requires.
        code, tail = run_command(log, "npm-ci", [npm, "ci"], root)
        if code:
            raise StepFailed(f"npm ci failed: {tail}")


def close_expired(root, today):
    path = root / "data/latest.json"
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    closed = close_expired_out_of_scope(snapshot, today)
    if closed:
        path.write_bytes((json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return closed


def write_deadlines(root, date):
    """The site's deadline fields come from code, not from the writer (review-2026-11-06-dday.md)."""
    path = root / "data/latest.json"
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    closed = apply_deadlines(snapshot, date)
    data = (json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.write_bytes(data)
    (root / f"data/archive/{date}.json").write_bytes(data)
    return closed


def run_crawl(root, log):
    code, _ = run_command(log, "crawl", ["node", "scripts/crawl_sources.mjs"], root)
    return code


def run_prepare(root, today, no_pull=False, sync=sync_main, deps=check_dependencies, crawl=run_crawl):
    result = {"status": "FAILED", "noPull": no_pull}
    log = RunLog(root, today, "prepare")
    log_environment(log, root, {"noPull": no_pull})
    try:
        if not no_pull:
            with log.stage("sync"):
                sync(root)
        with log.stage("dependencies"):
            deps(root, log)
        with log.stage("close_expired"):
            result["closedOutOfScope"] = close_expired(root, today)
        with log.stage("crawl"):
            result["crawlerExitCode"] = crawl(root, log)
        cache_path = root / f"data/source-cache/{today}.json"
        if not cache_path.exists():
            raise StepFailed(f"crawler left no cache for {today}")
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        manifest = json.loads((root / "data/crawler-sources.json").read_text(encoding="utf-8"))
        log.event("sources", sources=source_stats(cache))
        result.update(evaluate_sources(cache, manifest, today))
        with log.stage("details"):
            result.update(write_details(root, today, cache, log))
        if result["requiredFailed"]:
            raise StepFailed(f"required sources failed: {', '.join(result['requiredFailed'])}")
        result["status"] = "OK"
        log.event("run_end", status="OK", failed=result["failed"], unfinished=result["unfinished"])
        return 0
    except Exception as error:
        return finish_failed(log, result, "prepare", error)
    finally:
        write_report(root, today, "prepare", result)


def allowed_paths(date):
    return [
        "data/latest.json",
        f"data/archive/{date}.json",
        f"data/research/{date}.json",
        f"data/source-cache/{date}.json",
        "data/source-cache/latest.json",
    ]


def changed_paths(root):
    tracked = git_text(root, "diff", "--name-only", "HEAD")
    committed = git_text(root, "diff", "--name-only", "origin/main...HEAD")
    return sorted({line for text in (tracked, committed) for line in text.splitlines() if line})


def date_problem(snapshot_date, main_date, today):
    if snapshot_date < main_date:
        return f"snapshot {snapshot_date} is older than main {main_date}"
    if snapshot_date != today:
        return f"snapshot {snapshot_date} is not today {today}"
    return None


def check_files(root, date, baseline, log):
    for name in (f"data/archive/{date}.json", f"data/research/{date}.json"):
        if not (root / name).exists():
            raise StepFailed(f"missing {name}")
    # Git stores both with LF; the working copies may differ in line endings on Windows.
    latest, archive = (
        (root / name).read_bytes().replace(b"\r\n", b"\n")
        for name in ("data/latest.json", f"data/archive/{date}.json")
    )
    if latest != archive:
        raise StepFailed("dated archive differs from data/latest.json")


def run_checks(root, date, baseline, log):
    check_files(root, date, baseline, log)
    audit = f"data/research/{date}.json"
    commands = (
        ("test-research-rules", ["scripts/test_research_rules.py"]),
        ("test-publication-bundle", ["scripts/test_publication_bundle.py"]),
        ("validate-data", ["scripts/validate_data.py", "data/latest.json"]),
        ("validate-audit", ["scripts/validate_research_audit.py", audit, "data/latest.json", str(baseline)]),
    )
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    for name, command in commands:
        code, tail = run_command(log, name, [sys.executable, *command], root, env=env)
        if code:
            raise StepFailed(f"{command[0]} failed: {tail}")


def push_main(root, date, log):
    if git_text(root, "rev-parse", "--abbrev-ref", "HEAD") != "main":
        raise StepFailed("publish must run on main")
    git(root, "add", "--", *[name for name in allowed_paths(date) if (root / name).exists()])
    if git(root, "diff", "--cached", "--quiet", check=False).returncode:
        git(root, "commit", "-m", f"Update daily brief for {date}")
    for attempt in range(1, PUSH_ATTEMPTS + 1):
        git(root, "fetch", "origin", "main")
        if git(root, "rebase", "origin/main", check=False).returncode:
            git(root, "rebase", "--abort", check=False)
            raise StepFailed("rebase onto main failed")
        pushed = git(root, "push", "origin", "HEAD:main", check=False)
        log.event(
            "push", attempt=attempt, exitCode=pushed.returncode,
            stderr=pushed.stderr.decode("utf-8", "replace").strip()[-OUTPUT_TAIL_CHARS:],
        )
        if not pushed.returncode:
            return git_text(root, "rev-parse", "HEAD")
    raise StepFailed(f"push to main failed {PUSH_ATTEMPTS} times")


def fetch_public_latest():
    url = f"{PUBLIC_LATEST_URL}?t={int(time.time())}"
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()


def wait_for_public(root, fetch_public, wait_seconds, poll_seconds, log):
    # Compare the committed bytes: the working copy may use CRLF on Windows.
    expected = hashlib.sha256(git(root, "show", "HEAD:data/latest.json").stdout).hexdigest()
    deadline = time.monotonic() + wait_seconds
    while True:
        actual = error = None
        try:
            actual = hashlib.sha256(fetch_public()).hexdigest()
        except OSError as failure:
            error = str(failure)
        log.event("public_check", expected=expected, actual=actual, matched=actual == expected, error=error)
        if actual == expected:
            return
        if time.monotonic() >= deadline:
            raise StepFailed("public site does not match the pushed data/latest.json")
        time.sleep(poll_seconds)


def run_publish(
    root, today, no_push=False, checks=run_checks, fetch_public=fetch_public_latest,
    wait_seconds=PUBLIC_WAIT_SECONDS, poll_seconds=PUBLIC_POLL_SECONDS,
):
    result = {"status": "FAILED", "noPush": no_push}
    log = RunLog(root, today, "publish")
    log_environment(log, root, {"noPush": no_push})
    try:
        git(root, "fetch", "origin", "main")
        main_bytes = git(root, "show", "origin/main:data/latest.json").stdout
        main_date = json.loads(main_bytes)["date"]
        date = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))["date"]
        log.event("dates", snapshot=date, main=main_date, today=today)
        problem = date_problem(date, main_date, today)
        if problem:
            raise StepFailed(problem)
        forbidden = sorted(set(changed_paths(root)) - set(allowed_paths(date)))
        result["otherChanges"] = forbidden
        log.event("changes", outsideBrief=forbidden)
        if forbidden and not no_push:
            raise StepFailed(f"changes outside the brief: {', '.join(forbidden)}")
        baseline = root / f"artifacts/daily/baseline-{date}.json"
        baseline.parent.mkdir(parents=True, exist_ok=True)
        baseline.write_bytes(main_bytes)
        with log.stage("deadlines"):
            # Compare first: rewriting both files would hide a writer's mismatch.
            check_files(root, date, baseline, log)
            result["closedByDeadline"] = write_deadlines(root, date)
            log.event("deadlines", closed=result["closedByDeadline"])
        with log.stage("checks"):
            checks(root, date, baseline, log)
        if no_push:
            result["status"] = "CHECKED"
            log.event("run_end", status="CHECKED")
            return 0
        with log.stage("push"):
            result["commit"] = push_main(root, date, log)
        with log.stage("public_check"):
            wait_for_public(root, fetch_public, wait_seconds, poll_seconds, log)
        result["status"] = "OK"
        log.event("run_end", status="OK", commit=result["commit"])
        return 0
    except Exception as error:
        return finish_failed(log, result, "publish", error)
    finally:
        write_report(root, today, "publish", result)


def run_explore_step(root, today):
    log = RunLog(root, today, "explore")
    log_environment(log, root, {})
    with log.stage("explore"):
        result = run_explore(root, today, log)
    write_report(root, today, "explore", result)
    log.event("run_end", status=result["status"], urlCount=result.get("urlCount"))
    return 0


def run_details_step(root, today):
    log = RunLog(root, today, "details")
    log_environment(log, root, {})
    cache = json.loads((root / f"data/source-cache/{today}.json").read_text(encoding="utf-8"))
    with log.stage("details"):
        result = write_details(root, today, cache, log)
    print(result)
    return 0


def run_verify_step(root, today):
    log = RunLog(root, today, "verify")
    log_environment(log, root, {})
    with log.stage("verify"):
        result = run_verify(root, today, log)
    write_report(root, today, "verify", result)
    log.event("run_end", status=result["status"], items=result["items"])
    return 0


def titan_status():
    try:
        return TitanClient().call("/v1/status")
    except ExploreFailed:
        return None


def chrome_running(profile):
    out = subprocess.run(["powershell", "-NoProfile", "-Command",
                          "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object { $_.CommandLine }"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    return str(profile).lower() in out.lower()


def preflight(log, wait_seconds=BROWSER_WAIT_SECONDS):
    """Start Titan and this project's Chrome when they are off, then wait for the browser bridge (user: "켜")."""
    if titan_status() is None:
        log.event("start_titan", path=str(TITAN_EXE))
        subprocess.Popen([str(TITAN_EXE)])
    if not chrome_running(CHROME_PROFILE):
        log.event("start_chrome", profile=str(CHROME_PROFILE))
        subprocess.Popen([str(CHROME_EXE), f"--user-data-dir={CHROME_PROFILE}", "--no-first-run", "about:blank"])
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        status = titan_status()
        if status and status.get("bridge", {}).get("present"):
            log.event("browser_ready")
            return
        time.sleep(5)
    raise StepFailed("Titan browser bridge did not come up")


def run_research(root, today, use_gpt=False, client_factory=TitanClient, wait_seconds=WAIT_SECONDS, poll_seconds=POLL_SECONDS):
    """Cards from crawled fields by code, then assemble (user 2026-11-10: "코드로바꿔").

    use_gpt runs the older GPT find and card writing instead; each stage's result is saved as it ends.
    """
    result = {"status": "FAILED"}
    log = RunLog(root, today, "research")
    log_environment(log, root, {})
    state_path = root / f"artifacts/daily/{today}-gpt.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}

    def save():
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=1) + chr(10), encoding="utf-8")

    try:
        client = None
        if use_gpt:
            with log.stage("preflight"):
                preflight(log)
            client = client_factory()
            result["workers"] = gpt_jobs.worker_limit(client)
        elif "find" not in state:
            # GPT free exploration runs with every daily crawl (user 2026-11-10: "매일 크롤러 돌때 같이").
            # Its leads become code cards and its listing pages become crawler candidates; if GPT
            # cannot run, the brief is still published from the crawl.
            with log.stage("free_explore"):
                try:
                    preflight(log)
                    state["find"] = gpt_jobs.run_find(root, today, client_factory(), log, wait_seconds, poll_seconds,
                                                      only={"find-free"})
                except (StepFailed, ExploreFailed) as error:
                    log.event("free_explore_failed", reason=str(error))
                    state["find"] = {"rows": [], "jobs": [{"name": "find-free", "status": "FAILED", "reason": str(error)}]}
                save()
        if "find" not in state:
            with log.stage("find"):
                state["find"] = gpt_jobs.run_find(root, today, client, log, wait_seconds, poll_seconds)
                save()
        if "candidates" not in state:
            details = json.loads((root / f"artifacts/daily/{today}-details.json").read_text(encoding="utf-8"))
            state["candidates"], state["decided"] = gpt_jobs.build_candidates(
                root, today, details, state["find"]["rows"], earlier_decisions(root, today))
            latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
            state["due"] = [x["id"] for g in ("contests", "support") for x in latest[g]
                            if x.get("status") in ("OPEN", "UPCOMING") and is_reverification_due(x, today)]
            save()
        if "check" not in state:
            with log.stage("check"):
                if use_gpt:
                    state["check"] = gpt_jobs.run_check(root, today, state["candidates"], client, log, wait_seconds, poll_seconds)
                else:
                    state["check"] = {"answers": code_cards.answers(state["candidates"], today), "batches": []}
                save()
        # Existing items are no longer re-checked; passed deadlines close by date at publish.
        state["reverify"] = {"skipped": "재확인 생략(사용자 결정 2026-11-09 \"둘 다 빼기\")"}
        save()
        with log.stage("assemble"):
            result["brief"] = assemble(root, today)
        result.update(status="OK", candidates=len(state["candidates"]), due=len(state["due"]),
                      batches={k: state[k].get("batches") or state[k].get("jobs") for k in ("find", "check", "reverify")})
        log.event("run_end", status="OK", **result["brief"])
        return 0
    except Exception as error:
        return finish_failed(log, result, "research", error)
    finally:
        write_report(root, today, "research", result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare").add_argument("--no-pull", action="store_true", help="keep the current code")
    commands.add_parser("details")
    commands.add_parser("explore")
    commands.add_parser("verify")
    commands.add_parser("publish").add_argument("--no-push", action="store_true", help="stop after the checks")
    commands.add_parser("research").add_argument("--gpt", action="store_true", help="GPT find and card writing")
    commands.add_parser("all")
    args = parser.parse_args()
    today = datetime.now(SEOUL).date().isoformat()
    if args.command == "prepare":
        return run_prepare(ROOT, today, no_pull=args.no_pull)
    if args.command == "details":
        return run_details_step(ROOT, today)
    if args.command == "explore":
        return run_explore_step(ROOT, today)
    if args.command == "verify":
        return run_verify_step(ROOT, today)
    if args.command == "research":
        return run_research(ROOT, today, use_gpt=args.gpt)
    if args.command == "all":
        for step in (lambda: run_prepare(ROOT, today), lambda: run_research(ROOT, today), lambda: run_publish(ROOT, today)):
            if step():
                return 1
        return 0
    return run_publish(ROOT, today, no_push=args.no_push)


if __name__ == "__main__":
    sys.exit(main())
