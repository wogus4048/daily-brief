#!/usr/bin/env python3
"""Titan Web GPT workers: free exploration beyond the crawled sites and official-page checks.

A Prime chat only starts the workers. It has twice not resumed to merge their reports,
so this program reads each worker's answer itself. Answers are leads, never published
facts, and a failure here is recorded without stopping the day's brief.
"""

import json
import os
import re
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

WAIT_SECONDS = 1800
POLL_SECONDS = 15
# Titan refuses a fourth live worker (config multiAgent.maxWorkers = 3).
VERIFY_WORKERS = 3
EXPLORE_WORKERS = 2
ITEMS_PER_WORKER = 5
BATCH_SIZE = VERIFY_WORKERS * ITEMS_PER_WORKER
FINISHED_WORKER_STATES = {"sleeping", "finished", "failed"}
URL_PATTERN = re.compile(r"https?://[^\s<>\"'`)\]|]+")

# 2026-11-05: without these rules GPT used the Titan browser 6 times for 20 items, read two
# tabs at once, stopped at the first timeout, and reported a page it had read as unread.
BROWSER_RULES = """공식 페이지 확인 방법: 브라우저 도구(browser_tabs, browser_snapshot)로 직접 열어라. browser_tabs list로 브라우저별 탭을 보고, 이 대화의 URL이 있는 브라우저의 browserId만 써라. 다른 브라우저는 쓰지 마라. 탭은 한 번에 하나만 new로 열고, 다 읽은 뒤 close로 닫고 다음 탭을 열어라. 동시에 읽지 마라. browser_snapshot이 실패하면 오류 안내대로 다시 연결해 2번까지 다시 시도해라. 실제로 읽은 페이지를 못 읽었다고 적지 마라."""

PRIME_PROMPT = """worker를 {workers}개 띄워 아래 일을 나눠 맡겨라. 네가 직접 조사하지 마라. 일이 겹치지 않게 나누고, 아래 지시를 각 worker에게 빠짐없이 전해라. 각 worker는 맡은 결과를 전부 Prime에게 message로 보내고 finish해야 한다. 네가 결과를 합칠 필요는 없다.

{work}"""

VERIFY_PROMPT = """오늘은 {today}이다. 아래 공고 {count}건을 하나씩 공식 페이지(주최 기관의 공고나 접수 페이지)에서 확인해라. 모음 사이트 내용만 보고 적지 마라. 파일을 만들지 마라.

{browser_rules}

{items}

결과는 줄이지 말고 전부, 코드 블록 하나에 한 줄씩 다음 형식으로 적어라.
번호 | 공식 URL | 주최 | 마감일(YYYY-MM-DD) | 접수 상태(접수중/마감/예정/확인불가) | 참가 대상 | 공식 페이지의 근거 문구

공식 페이지를 찾지 못했거나 열지 못했으면 공식 URL에 '없음'이라 적고 이유를 근거 칸에 적어라. 추측으로 칸을 채우지 마라."""

PROMPT = """오늘은 {today}이다. 지금 접수 중인 한국 공모전과 창업 지원사업을 넓게 찾아, 제목·주최·마감일·참가 조건·공식 링크로 정리해라.

범위: 공모전은 아이디어·제안 공모전과 프로그램·소프트웨어 개발 대회를 폭넓게 수집한다. 지원사업은 창업·스타트업 지원 프로그램이다. 상금 규모나 추정한 개인 적합성으로 임의 제외하지 않고 참가 조건을 표시한다. 네이밍·슬로건·표어·캐릭터, 문학(백일장·신춘문예·수기), 영상·사진, 미술·디자인·웹툰 공모전은 수집하지 않는다.

제외할 출처: 아래 사이트는 이미 다른 수집이 맡고 있다. 이 사이트의 목록이나 상세를 출처로 쓰지 말고, 여기에 없을 만한 공고를 스스로 찾아라. {excluded}.

방법: 어떤 곳을 뒤질지는 네가 정해라. 찾은 뒤 분야별로 적게 나온 곳을 다시 찾아라. 찾은 공고는 공식 공고나 접수 페이지로 마감일을 확인하고, 확인하지 못했으면 '미확인'이라고 표시하라. 파일을 만들지 말고 직접 찾아라.

{browser_rules}

결과: 찾은 공고를 하나도 줄이지 말고 전부 마크다운 표로 이 대화의 최종 답변에 적어라. '등'으로 생략하지 마라. 표 다음에 코드 블록 하나로 `번호 | URL` 형식의 평문 링크 목록을 적어라. 마지막에 두 가지를 더 적어라. (1) 어떤 경로·검색어로 찾았는지. (2) 이번에 새로 알게 된, 공고가 반복해서 올라오는 목록 페이지(한 건짜리 공고 주소 말고)를 평문 URL로."""


class ExploreFailed(Exception):
    pass


def build_prompt(manifest, today):
    names = [entry.get("name") or entry["key"] for entry in manifest.get("active", [])]
    work = PROMPT.format(today=today, excluded=", ".join(names), browser_rules=BROWSER_RULES)
    return PRIME_PROMPT.format(workers=EXPLORE_WORKERS, work=work)


def build_verify_prompt(items, today):
    lines = "\n".join(f"{number}. {item.get('title')} | {item.get('url')}" for number, item in enumerate(items, 1))
    work = VERIFY_PROMPT.format(today=today, count=len(items), browser_rules=BROWSER_RULES, items=lines)
    return PRIME_PROMPT.format(workers=VERIFY_WORKERS, work=work)


def candidate_items(cache):
    by_url = {}
    for source in cache.get("sources", {}).values():
        for item in source.get("actionableItems") or []:
            if item.get("url"):
                by_url.setdefault(item["url"], item)
    return list(by_url.values())


def extract_urls(text):
    return sorted({url.rstrip(".,;:") for url in URL_PATTERN.findall(text or "")})


class TitanClient:
    """Titan's local Control API. Tokens are never logged."""

    def __init__(self, appdata=None):
        appdata = Path(appdata or os.environ.get("APPDATA", ""))
        try:
            runtime = json.loads((appdata / "Titan/runtime-profile.json").read_text(encoding="utf-8"))
            self.user_data = Path(runtime["root"]) / "user-data"
            folder = self.user_data / "control-api"
            port = json.loads((folder / "endpoint.json").read_text(encoding="utf-8"))["port"]
            self.token = (folder / "token").read_text(encoding="utf-8").strip()
        except (OSError, KeyError, TypeError, ValueError):
            raise ExploreFailed("Titan control API is not available") from None
        self.base_url = f"http://127.0.0.1:{port}"

    def call(self, route, body=None):
        request = Request(
            self.base_url + route,
            method="POST" if body is not None else "GET",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            raise ExploreFailed(f"Titan answered HTTP {error.code} on {route}") from None
        except (URLError, OSError, TimeoutError, ValueError):
            raise ExploreFailed(f"Titan did not answer on {route}") from None

    def open_chat(self, text):
        request_id = str(uuid.uuid4())
        return self.call("/v1/sessions/open", {"id": request_id, "text": text})["sessionId"]

    def session(self, session_id):
        return self.call(f"/v1/sessions/{session_id}")["session"]

    def agents(self):
        return self.call("/v1/agents").get("agents", [])

    def worker_answer(self, conversation_id):
        for row in self.call("/v1/sessions?limit=50").get("sessions", []):
            if row.get("conversationId") == conversation_id:
                return read_worker_report(self.user_data / "sessions" / row["id"])
        raise ExploreFailed(f"no session for worker conversation {conversation_id}")

    def cleanup(self, session_id):
        self.call(f"/v1/sessions/{session_id}/cleanup", {})


def read_final_answer(folder):
    # The control API cuts text at 4,000 characters; the session files keep the whole answer.
    finals = []
    for path in Path(folder).glob("*.json"):
        row = json.loads(path.read_text(encoding="utf-8"))
        if row.get("kind") == "assistant_message" and row.get("final"):
            finals.append(row)
    if not finals:
        raise ExploreFailed("Titan recorded no final answer")
    last = max(finals, key=lambda row: row.get("seq", 0))
    text = (last.get("renderedText") or last.get("message") or {}).get("text") or ""
    html = (last.get("renderedHtml") or {}).get("text") or ""
    return text, extract_urls(text + "\n" + html)


def read_worker_report(folder):
    """A worker's results go to Prime through the agents tool; its chat answer is only a summary."""
    folder = Path(folder)
    parts = []
    with (folder / "events.jsonl").open(encoding="utf-8") as events:
        for line in events:
            event = json.loads(line)
            call = event.get("call") or event
            if event.get("kind") != "tool_call" or call.get("tool") != "agents":
                continue
            try:
                args = json.loads((call.get("args") or {}).get("text") or "{}")
            except ValueError:
                continue
            if args.get("action") == "message" and args.get("to") == "prime":
                parts.append(args.get("text") or "")
            elif args.get("action") == "finish":
                parts.append(args.get("result") or "")
    try:
        parts.append(read_final_answer(folder / "messages")[0])
    except ExploreFailed:
        if not parts:
            raise
    text = "\n\n".join(part for part in parts if part)
    return text, extract_urls(text)


def wait_for_workers(client, session_id, wait_seconds, poll_seconds, log):
    """Return the worker conversations of this Prime once none is still working."""
    deadline = time.monotonic() + wait_seconds
    run_id = None
    conversations = []
    while True:
        session = client.session(session_id)
        rows = client.agents()
        for row in rows:
            if row.get("role") == "prime" and row.get("conversationId") == session.get("conversationId"):
                run_id = row.get("runId")
        workers = [row for row in rows if run_id and row.get("runId") == run_id and row.get("role") == "worker"]
        for worker in workers:
            if worker.get("conversationId") and worker["conversationId"] not in conversations:
                conversations.append(worker["conversationId"])
        # A parked run leaves the agent list, so workers seen earlier and now absent are done.
        busy = [row for row in workers if row.get("state") not in FINISHED_WORKER_STATES]
        if conversations and not busy and not session.get("activeTurnId"):
            log.event("workers_finished", conversations=conversations)
            return conversations
        if time.monotonic() >= deadline:
            raise ExploreFailed(f"workers not finished within {wait_seconds} seconds (seen {len(conversations)})")
        time.sleep(poll_seconds)


def ask(client, prompt, answer_path, wait_seconds, poll_seconds, log):
    """One Prime run from open to saved worker answers; its chat tab is always released."""
    session_id = None
    try:
        session_id = client.open_chat(prompt)
        log.event("chat_opened", sessionId=session_id, promptChars=len(prompt))
        conversations = wait_for_workers(client, session_id, wait_seconds, poll_seconds, log)
        parts, urls, missing = [], set(), []
        for number, conversation_id in enumerate(conversations, 1):
            try:
                text, found = client.worker_answer(conversation_id)
            except ExploreFailed as error:
                missing.append(conversation_id)
                log.event("worker_answer_missing", conversationId=conversation_id, reason=str(error))
                continue
            parts.append(f"## worker {number}\n\n{text}")
            urls.update(found)
        if not parts:
            raise ExploreFailed("no worker left an answer")
        answer_path.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
        return session_id, sorted(urls), missing
    finally:
        if session_id:
            try:
                client.cleanup(session_id)
            except ExploreFailed as error:
                log.event("chat_cleanup_failed", sessionId=session_id, reason=str(error))


def run_verify(root, today, log, client_factory=TitanClient, batch_size=BATCH_SIZE,
               wait_seconds=WAIT_SECONDS, poll_seconds=POLL_SECONDS):
    """Ask GPT to confirm candidates on official pages, one chat per batch."""
    started = time.monotonic()
    cache = json.loads((root / f"data/source-cache/{today}.json").read_text(encoding="utf-8"))
    items = candidate_items(cache)
    batches = []
    client = None
    for index, start in enumerate(range(0, len(items), batch_size), 1):
        batch = {"number": index, "status": "FAILED", "items": len(items[start:start + batch_size])}
        answer = root / f"artifacts/daily/{today}-verify-{index:02d}.md"
        batch_started = time.monotonic()
        try:
            client = client or client_factory()
            prompt = build_verify_prompt(items[start:start + batch_size], today)
            batch["sessionId"], _, missing = ask(client, prompt, answer, wait_seconds, poll_seconds, log)
            batch.update(status="PARTIAL" if missing else "OK", missing=missing,
                         answer=answer.relative_to(root).as_posix())
        except ExploreFailed as error:
            batch["reason"] = str(error)
            log.event("verify_batch_failed", number=index, reason=str(error))
        batch["seconds"] = round(time.monotonic() - batch_started, 1)
        batches.append(batch)
    failed = sum(batch["status"] != "OK" for batch in batches)
    status = "OK" if not failed else "FAILED" if failed == len(batches) else "PARTIAL"
    return {"status": status, "items": len(items), "batches": batches,
            "seconds": round(time.monotonic() - started, 1)}


def run_explore(root, today, log, client_factory=TitanClient, wait_seconds=WAIT_SECONDS, poll_seconds=POLL_SECONDS):
    """Return the report fields. Never raises for an exploration failure."""
    started = time.monotonic()
    result = {"status": "FAILED"}
    try:
        client = client_factory()
        manifest = json.loads((root / "data/crawler-sources.json").read_text(encoding="utf-8"))
        answer = root / f"artifacts/daily/{today}-explore.md"
        session_id, urls, missing = ask(client, build_prompt(manifest, today), answer, wait_seconds, poll_seconds, log)
        result.update(status="PARTIAL" if missing else "OK", sessionId=session_id, missing=missing,
                      urlCount=len(urls), urls=urls,
                      answer=answer.relative_to(root).as_posix())
    except ExploreFailed as error:
        result["reason"] = str(error)
        log.event("explore_failed", reason=str(error))
    result["seconds"] = round(time.monotonic() - started, 1)
    return result
