#!/usr/bin/env python3
"""Fixed local steps around the daily Claude run.

prepare: refresh main, check dependencies, close expired out-of-scope items, crawl.
research: GPT workers find, check, re-verify and write; a program assembles the brief
  (docs/superpowers/specs/2026-11-09-gpt-research-design.md).
publish: check the brief, push it straight to main, confirm the public site.
all: prepare, research, publish in one run.
setup: make a PC able to run all (runner clone, packages, Chrome profile); safe to run again.

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
# Daily GPT chats: the contest chat (annual list + other contests) and free exploration (user 2026-11-10).
DAILY_FIND_CHATS = {"find-annual", "find-free"}
PUBLIC_WAIT_SECONDS = 600
PUBLIC_POLL_SECONDS = 15
OUTPUT_TAIL_CHARS = 2000
TITAN_EXE = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Titan/Titan.exe"
TITAN_EXTENSION = TITAN_EXE.parent / "resources/extension"
# By full path: a PC's PATH can lack the PowerShell folder (found 2026-11-12 on a second PC).
POWERSHELL = Path(os.environ.get("SYSTEMROOT", r"C:\Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"
# This project's own Chrome profile with the Titan extension (not the Naver one; findings 2026-11-09).
# Each PC keeps its path in the runner marker; an empty marker means the first PC's path.
LEGACY_CHROME_PROFILE = Path(r"D:\daily-brief-ops\chrome-titan")
CHATGPT_URL = "https://chatgpt.com/"
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


def runner_settings(root):
    """This PC's settings, kept in the runner marker (JSON; empty for the first PC)."""
    marker = root / RUNNER_MARKER
    text = marker.read_text(encoding="utf-8").strip() if marker.exists() else ""
    try:
        settings = json.loads(text) if text else {}
    except ValueError:
        raise StepFailed(f"{RUNNER_MARKER} is not JSON: run setup again") from None
    if not isinstance(settings, dict):
        raise StepFailed(f"{RUNNER_MARKER} is not a JSON object: run setup again")
    return settings


def chrome_profile(root):
    return Path(runner_settings(root).get("chromeProfile") or LEGACY_CHROME_PROFILE)


def chrome_exe():
    folders = [os.environ.get(name) for name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
    candidates = [Path(folder) / "Google/Chrome/Application/chrome.exe" for folder in folders if folder]
    return next((path for path in candidates if path.exists()), None)


def playwright_matches_lock(root):
    """node_modules must hold the Playwright version package-lock.json names, not just any version."""
    installed = root / "node_modules/playwright/package.json"
    if not installed.exists():
        return False
    lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    wanted = lock.get("packages", {}).get("node_modules/playwright", {}).get("version")
    return json.loads(installed.read_text(encoding="utf-8")).get("version") == wanted


def check_dependencies(root, log):
    if importlib.util.find_spec("tzdata") is None:
        raise StepFailed("Python package tzdata is missing")
    if not playwright_matches_lock(root):
        npm = shutil.which("npm")
        if not npm:
            raise StepFailed("npm is missing")
        # npm ci leaves package-lock.json untouched, which publish requires.
        code, tail = run_command(log, "npm-ci", [npm, "ci"], root)
        if code:
            raise StepFailed(f"npm ci failed: {tail}")
    # The crawler launches Playwright's own Chromium; a new PC or a Playwright update needs its build.
    # This returns quickly when the build is already there.
    code, tail = run_command(log, "playwright-install",
                             ["node", "node_modules/playwright/cli.js", "install", "chromium"], root)
    if code:
        raise StepFailed(f"playwright install chromium failed: {tail}")


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


def redeploy_pages(root, log):
    """Ask GitHub to run the Pages workflow again (it failed with "try again later" three times on 2026-11-10)."""
    done = subprocess.run(["gh", "workflow", "run", "pages.yml", "--ref", "main"], cwd=root,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    log.event("pages_redeploy", exitCode=done.returncode, stderr=done.stderr.strip()[-OUTPUT_TAIL_CHARS:])


def run_publish(
    root, today, no_push=False, checks=run_checks, fetch_public=fetch_public_latest,
    wait_seconds=PUBLIC_WAIT_SECONDS, poll_seconds=PUBLIC_POLL_SECONDS, redeploy=redeploy_pages,
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
            try:
                wait_for_public(root, fetch_public, wait_seconds, poll_seconds, log)
            except StepFailed:
                # A failed Pages deployment clears on a second run; one retry, then report.
                redeploy(root, log)
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
    out = subprocess.run([str(POWERSHELL), "-NoProfile", "-Command",
                          "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object { $_.CommandLine }"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    return str(profile).lower() in out.lower()


def start_chrome(profile, *urls):
    chrome = chrome_exe()
    if chrome is None:
        raise StepFailed("Chrome is not installed")
    subprocess.Popen([str(chrome), f"--user-data-dir={profile}", "--no-first-run", *(urls or ["about:blank"])])


def preflight(log, root, wait_seconds=BROWSER_WAIT_SECONDS):
    """Start Titan and this project's Chrome when they are off, then wait for the browser bridge (user: "켜")."""
    profile = chrome_profile(root)
    if titan_status() is None:
        if not TITAN_EXE.exists():
            raise StepFailed(f"Titan is not installed at {TITAN_EXE}")
        log.event("start_titan", path=str(TITAN_EXE))
        subprocess.Popen([str(TITAN_EXE)])
    if not chrome_running(profile):
        if not profile.exists():
            raise StepFailed(f"Chrome profile {profile} is missing: run setup")
        log.event("start_chrome", profile=str(profile))
        start_chrome(profile)
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
                preflight(log, root)
            client = client_factory()
            result["workers"] = gpt_jobs.worker_limit(client)
        elif "find" not in state:
            # GPT free exploration runs with every daily crawl (user 2026-11-10: "매일 크롤러 돌때 같이"),
            # after the contest chat: annual contests (AI TOP 100, 모두의 창업) and other contests.
            # The chats run one after another and share Titan's 2 workers.
            # Its leads become code cards and its listing pages become crawler candidates; if GPT
            # cannot run, the brief is still published from the crawl.
            with log.stage("free_explore"):
                try:
                    preflight(log, root)
                    state["find"] = gpt_jobs.run_find(root, today, client_factory(), log, wait_seconds, poll_seconds,
                                                      only=DAILY_FIND_CHATS)
                except (StepFailed, ExploreFailed) as error:
                    log.event("free_explore_failed", reason=str(error))
                    state["find"] = {"rows": [], "jobs": [{"name": name, "status": "FAILED", "reason": str(error)}
                                                          for name in sorted(DAILY_FIND_CHATS)]}
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


def default_runner():
    return (Path("D:/Dev") if Path("D:/").exists() else Path.home()) / "daily-brief-runner"


def default_chrome_profile():
    # The first PC used D:\daily-brief-ops; a PC without a D: drive keeps the profile in its app data.
    if Path("D:/").exists():
        return LEGACY_CHROME_PROFILE
    return Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "daily-brief-ops/chrome-titan"


def clone_runner(source, runner):
    """Clone main into a dedicated runner folder and mark it.

    An existing folder without the marker is never adopted: sync_main would discard the work in it.
    """
    if (runner / RUNNER_MARKER).exists():
        return "kept"
    if runner.exists() and any(runner.iterdir()):
        raise StepFailed(f"{runner} already holds files without {RUNNER_MARKER}; choose another --runner")
    url = git_text(source, "remote", "get-url", "origin")
    runner.parent.mkdir(parents=True, exist_ok=True)
    git(runner.parent, "clone", "--branch", "main", url, str(runner))
    (runner / RUNNER_MARKER).write_text("{}\n", encoding="utf-8")
    return "cloned"


def save_settings(runner, **changes):
    settings = {**runner_settings(runner), **changes}
    (runner / RUNNER_MARKER).write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return settings


def titan_extension_loaded(profile):
    """True when the profile has Titan's extension (a folder with browser-control.js) loaded and enabled."""
    try:
        preferences = json.loads((profile / "Default/Secure Preferences").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    extensions = preferences.get("extensions", {}).get("settings", {})
    return any(
        isinstance(entry, dict) and entry.get("path") and not entry.get("disable_reasons")
        and (Path(entry["path"]) / "browser-control.js").exists()
        for entry in extensions.values()
    )


def run_setup(source, today, runner=None, profile=None, deps=check_dependencies, launch=True,
              wait_seconds=BROWSER_WAIT_SECONDS):
    """Make this PC able to run the daily brief. Safe to run again; returns 0 when nothing is left to do.

    Signing in and loading the Titan extension stay with the user; setup opens the pages and names the folder.
    """
    if runner is None and (source / RUNNER_MARKER).exists():
        runner = source
    runner = Path(runner or default_runner())
    todo = []
    missing = [tool for tool in ("git", "node", "npm") if not shutil.which(tool)]
    if missing:
        raise StepFailed(f"not installed: {', '.join(missing)}")
    state = clone_runner(source, runner)
    print(f"[OK] 실행 폴더 {runner} ({'새로 받음' if state == 'cloned' else '이미 있음'})")
    profile = Path(profile or runner_settings(runner).get("chromeProfile") or default_chrome_profile())
    save_settings(runner, chromeProfile=str(profile))
    print(f"[OK] 전용 크롬 프로필 {profile} ({RUNNER_MARKER}에 기록)")
    if not git(runner, "config", "user.email", check=False).stdout.strip():
        todo.append("발행 커밋에 쓸 git user.name과 user.email을 설정한다")

    log = RunLog(runner, today, "setup")
    log_environment(log, runner, {"profile": str(profile)})
    deps(runner, log)
    print("[OK] Python tzdata, npm 패키지, 크롤러용 Chromium")

    chrome = chrome_exe()
    if chrome is None:
        todo.append("Chrome을 설치한다")
    if not TITAN_EXE.exists():
        todo.append(f"Titan 앱을 설치한다 (찾은 위치: {TITAN_EXE})")
    if chrome and TITAN_EXE.exists():
        profile.mkdir(parents=True, exist_ok=True)
        extension = titan_extension_loaded(profile)
        if launch and titan_status() is None:
            log.event("start_titan", path=str(TITAN_EXE))
            subprocess.Popen([str(TITAN_EXE)])
        if launch and not chrome_running(profile):
            log.event("start_chrome", profile=str(profile))
            start_chrome(profile, *(([] if extension else ["chrome://extensions/"]) + [CHATGPT_URL]))
        if not extension:
            todo.append("방금 연 전용 크롬의 chrome://extensions에서 개발자 모드를 켜고 "
                        f"'압축해제된 확장 프로그램 로드'로 {TITAN_EXTENSION} 를 고른다")
        else:
            print("[OK] 전용 크롬 프로필에 Titan 확장 설치됨")
            deadline = time.monotonic() + (wait_seconds if launch else 0)
            while not (titan_status() or {}).get("bridge", {}).get("present"):
                if time.monotonic() >= deadline:
                    todo.append("Titan 앱과 전용 크롬이 켜져 있는지 보고, 확장이 Titan에 연결됐는지 확인한다")
                    break
                time.sleep(5)
            else:
                print("[OK] Titan 브라우저 연결")
        print("[확인 못 함] ChatGPT 로그인: 전용 크롬의 chatgpt.com 탭에서 로그인돼 있는지 직접 본다")

    log.event("run_end", status="OK" if not todo else "TODO", todo=todo)
    if todo:
        print("\n남은 일 (끝낸 뒤 setup을 다시 실행해 확인한다):")
        for number, item in enumerate(todo, 1):
            print(f"  {number}. {item}")
        return 2
    print(f"\n준비 끝. 매일 실행: {runner} 에서 python scripts/daily_run.py all")
    return 0


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
    setup = commands.add_parser("setup", help="prepare this PC (runner folder, packages, Chrome profile); safe to rerun")
    setup.add_argument("--runner", type=Path, help=f"runner folder (default {default_runner()})")
    setup.add_argument("--chrome-profile", type=Path, help=f"Chrome profile (default {default_chrome_profile()})")
    setup.add_argument("--no-launch", action="store_true", help="only check; do not start Titan or Chrome")
    args = parser.parse_args()
    today = datetime.now(SEOUL).date().isoformat()
    if args.command == "setup":
        try:
            return run_setup(ROOT, today, runner=args.runner, profile=args.chrome_profile, launch=not args.no_launch)
        except StepFailed as error:
            print(f"setup failed: {error}", file=sys.stderr)
            return 1
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
