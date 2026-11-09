#!/usr/bin/env python3
"""Daily research and writing by Titan GPT workers (docs/superpowers/specs/2026-11-09-gpt-research-design.md).

Every worker answers in ```json blocks, one JSON object per line, so this program
reads the results without a Claude step. Items sent by number come back by number;
numbers without an answer are sent once more, then recorded as missing.
"""

import json
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from free_explore import BROWSER_RULES, ExploreFailed, ask
from research_rules import normalize_url

SEOUL = ZoneInfo("Asia/Seoul")
# Short chats: one that stalls loses less work (user 2026-11-10 "하나의 채팅에 너무 오래 일시키면 멈출 가능성이 높아").
ITEMS_PER_WORKER = 5
NEXT_CANDIDATES_IN_PROMPT = 10
JSON_BLOCK = re.compile(r"```json\s*\n(.*?)```", re.S)
# Validator names (validate_research_audit.py TRACKS, REQUIRED_SOURCES); answers must use them exactly.
TRACK_AXES = {
    "aiData": ["llmAgents", "mlData", "visionSpeech"],
    "generalSoftware": ["appWebMobile", "backendApiCloudDevOps", "security", "fintech", "publicDataGovTech", "productBuild"],
    "publicIdea": ["governmentPublic", "industrySpecialized", "individualPrize"],
    "startupSupport": ["kstartupBusinessInfo", "sbaSeoul", "nipaKisa", "fintechSupport", "credits"],
    "upcomingOpenings": ["announcedNotOpen", "firstComeCountdown"],
    "aiNews": ["officialProduct", "githubReleases", "huggingFace", "researchLabs", "communities"],
    "aiDiscovery": ["sitesDirectories", "github", "skillsMcpAgents", "workflows", "communities", "sourceRadar"],
}
FIXED_SOURCES = {
    "Hackathon Korea": "https://koreahackathons.com/",
    "Grantly": "https://grantly.kr/opportunities/support",
    "링커리어": "https://linkareer.com/list/contest",
    "요즘것들": "https://www.allforyoung.com/",
    "ContestKorea": "https://www.contestkorea.com/",
    "소통24": "https://sotong.go.kr/",
    "정책브리핑": "https://www.korea.kr/briefing/policyBriefingList.do",
    "AI_TOP_100": "https://aitop100.org/",
    "EventUs/Luma/온오프믹스": "https://www.onoffmix.com/",
    "Meetup": "https://www.meetup.com/",
    "K-Startup": "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do",
    "기업마당": "https://www.bizinfo.go.kr/",
    "SBA": "https://www.sba.seoul.kr/",
    "NIPA": "https://www.nipa.kr/",
    "KISA": "https://www.kisa.or.kr/",
    "fintech": "https://fintech.or.kr/",
}
DISTRICTS = {"nowon": "노원구청", "dobong": "도봉구청", "gangbuk": "강북구청"}
SCOPE_RULES = """범위: 공모전은 아이디어·제안 공모전과 프로그램·소프트웨어·AI·데이터 개발 대회, 해커톤, 창업 경진대회다. 지원사업은 창업·스타트업 지원 프로그램과 모집(입주, 액셀러레이팅, 사업화 자금, 교육)이다. 상금 규모나 개인 적합성으로 빼지 않는다. 수집하지 않는 것: 네이밍·슬로건·표어·캐릭터, 문학(백일장·수기), 영상·사진, 미술·디자인·웹툰 공모전, 공모가 아닌 행사·포럼·설명회."""
ANSWER_RULES = """답 형식: 결과는 ```json 코드 블록 안에 한 줄에 JSON 객체 하나씩 적어라. Prime에게 보내는 메시지 하나는 3,500자를 넘기지 말고, 메시지마다 json 블록을 열고 닫아라. 블록 하나를 메시지 두 개에 걸쳐 쓰지 마라. 결과를 줄이거나 '등'으로 생략하지 마라."""
DEADLINE_RULE = """deadline 칸: 신규 지원자가 신청해야 하는 날짜를 연도까지 "YYYY-MM-DD" 목록으로 적는다(부문마다 다르면 모두). 등록 마감 뒤 제출만 남으면 등록 마감일만 적는다. 행사·심사·발표일은 넣지 않는다. 고정 마감일이 없으면 "상시", "수시", "예산 소진 시", "선착순" 중 하나, 마감일을 알 수 없으면 "확인 필요"."""
CARD_FIELDS = """카드 칸(모두 한국어): id(영문 소문자-하이픈, 연도로 끝남), title, summary(한 문장), description(두 문장 이내), categoryLabel("공모전 · 아이디어" 또는 "공모전 · 개발" 또는 "창업 · 지원사업"), icon(이모지 하나), tags(3~5개), period, deadlineText(사람이 읽는 마감 문구), deadline, participation, reward, businessRegistration, preStartup, employment, evaluation, aiSupport(명시 없으면 "명시 없음"), ideas(짧은 참가 아이디어 2개), links([{"label":"공식 공고","url":...}] 공식 링크 먼저), status("OPEN" 또는 접수 전이면 "UPCOMING"과 openingAt). 보이지 않는 사실은 지어내지 말고 "확인 필요"로 쓴다."""

PRIME = """worker를 {workers}개 띄워 아래 일을 나눠 맡겨라. 네가 직접 조사하지 마라. 일이 겹치지 않게 나누고, 아래 지시를 각 worker에게 빠짐없이 전해라. 각 worker는 맡은 결과를 전부 Prime에게 message로 보내고 finish해야 한다. 네가 결과를 합칠 필요는 없다.

{work}"""

FIND_PROMPT = """오늘은 {today}이다. 지금 접수 중이거나 곧 접수가 열리는 한국 공모전과 창업 지원사업을 찾아라. 파일을 만들지 마라.

{scope}

맡을 트랙과 축(이름을 그대로 써라): {axes}
먼저 아래 목록 페이지를 끝까지 열어 보고(공고는 검색보다 목록에서 많이 나온다), 그다음 축마다 서로 다른 한국어 검색어를 2개 이상 실제로 돌려라.
{pages}
{extra}
{browser_rules}

{answer_rules}
한 줄 형식:
- 후보마다 {{"kind":"candidate","track":"트랙","title":"...","url":"공식이나 찾은 주소","host":"주최","deadline":"YYYY-MM-DD나 문구","via":"찾은 경로"}}
- 축마다 {{"kind":"queries","track":"트랙","axis":"축","queries":["실제로 돌린 검색어",...]}}
{record_lines}- 공고가 반복해서 올라오는, 위 목록에 없는 새 목록 페이지마다 {{"kind":"listingPage","url":"...","name":"...","reason":"..."}}"""

NEWS_PROMPT = """오늘은 {today}이다. 지난 브리핑({last}) 이후의 AI 뉴스와 쓸 만한 AI 도구·저장소를 골라 카드로 써라. 파일을 만들지 마라.

먼저 아래 해커뉴스 상위 글 목록 전부와 GeekNews 첫 화면(https://news.hada.io/)을 훑어라. 그다음 축마다 서로 다른 검색어를 2개 이상 돌려라. 트랙마다 한국어 검색어와 영어 검색어를 함께 써라.
축(이름을 그대로 써라): {axes}
해커뉴스 상위 글:
{hn}
이미 있는 카드(다시 쓰지 마라): {existing}

뉴스 카드는 커뮤니티에서 실제로 화제가 된 것만 고르고, 1차 출처(공식 블로그, 릴리스 노트, 저장소, 모델 카드)를 열어 확인한 사실만 쓴다. 숫자는 출처에 적힌 것만 인용한다. 확인 못 한 점은 그렇다고 쓴다.
{browser_rules}

{answer_rules}
한 줄 형식:
- 축마다 {{"kind":"queries","track":"aiNews 또는 aiDiscovery","axis":"축","queries":[...]}}
- 검토한 후보마다 {{"kind":"candidate","track":"aiNews 또는 aiDiscovery","title":"...","url":"...","disposition":"PUBLISHED 또는 NOT_RELEVANT","reason":"고르지 않은 이유"}}
- 뉴스 카드 {{"kind":"aiNews","card":{{"id","categoryLabel":"AI 뉴스","icon","title","summary","description","why","tags":[...],"ideas":[2개],"links":[{{"label","url"}}],"communityEvidence":[{{"source","url","signal"}}],"verificationUrls":[...],"verificationNote":"..."}}}}
- 도구 카드 {{"kind":"aiDiscovery","card":{{"id","title","summary","description","why","discoveryType":"site|github|skill|mcp|agent|workflow|directory|discussion|platform","categories":[...],"signals":[...],"discoveryReason","links":[...],"related":[],"awareness":"WELL_KNOWN|SPECIALIZED|EARLY","trend":"HOT|RISING|STEADY|RESURFACED","newsState":"NEW_RELEASE|NEWLY_DISCOVERED|UPDATED|BASELINE"}}}}"""

CHECK_PROMPT = """오늘은 {today}이다. 아래 공고 후보 {count}건을 사이트에 올릴지 정하고, 올릴 것은 카드로 써라. 파일을 만들지 마라.
웹 검색과 브라우저를 쓰지 마라. 페이지를 열지 말고, 아래 후보 줄에 보이는 정보만 그대로 적어라. 보이지 않는 칸은 "확인 필요"라고 적는다(사용자 결정 2026-11-09). 속도가 중요하니 문장은 짧게 쓴다.

{scope}
{deadline_rule}
이미 사이트에 있는 접수 중 공고(같은 공고면 EXISTING): {existing}
같은 공고가 이 목록 안에 두 번 있으면 하나만 PUBLISHED로 하고 나머지는 DUPLICATE로 적는다. 지난 회차가 끝난 대회라도 이번 회차 공고면 새 공고다.
후보:
{items}

{answer_rules}
번호마다 반드시 한 줄을 적어라:
{{"n":번호,"disposition":"PUBLISHED|EXISTING|DUPLICATE|INELIGIBLE|CLOSED|NOT_RELEVANT","reason":"PUBLISHED가 아니면 이유","id":"EXISTING·DUPLICATE이면 같은 공고의 id나 번호","official":true 또는 false,"officialUrl":"확인한 공식 주소","track":"aiData|generalSoftware|publicIdea|startupSupport","card":{{...PUBLISHED일 때만...}}}}
official은 후보 줄의 주소나 홈페이지가 주최 기관 자신의 페이지면 true, 모음 사이트(콘테스트코리아, 위비티, 그랜틀리 등)뿐이면 false다.
{card_fields}"""

def now_iso():
    return datetime.now(SEOUL).isoformat(timespec="seconds")


def worker_limit(client):
    """Titan refuses more live workers than its app setting (2 on 2026-11-09, 3 on 11-05)."""
    try:
        config = json.loads((client.user_data / "config.json").read_text(encoding="utf-8"))
        return max(1, int(config.get("multiAgent", {}).get("maxWorkers") or 1))
    except (OSError, ValueError, TypeError, AttributeError):
        return 2


def parse_lines(text):
    """JSON objects from every ```json block; repeated lines (resent messages) count once."""
    rows, bad, seen = [], [], set()
    for block in JSON_BLOCK.findall(text or ""):
        for line in block.splitlines():
            line = line.strip().rstrip(",")
            if not line or line in seen:
                continue
            seen.add(line)
            try:
                row = json.loads(line)
            except ValueError:
                bad.append(line[:200])
                continue
            if isinstance(row, dict):
                rows.append(row)
            else:
                bad.append(line[:200])
    return rows, bad


def run_chat(client, prompt, answer_path, log, wait_seconds, poll_seconds):
    try:
        session_id, _, missing_workers = ask(client, prompt, answer_path, wait_seconds, poll_seconds, log)
    except ExploreFailed as error:
        if "no worker started" not in str(error):
            raise
        log.event("chat_reopened", answer=answer_path.name, reason=str(error))
        session_id, _, missing_workers = ask(client, prompt, answer_path, wait_seconds, poll_seconds, log)
    rows, bad = parse_lines(answer_path.read_text(encoding="utf-8"))
    if bad:
        log.event("unparsed_lines", answer=answer_path.name, count=len(bad), sample=bad[:3])
    return rows, {"sessionId": session_id, "missingWorkers": missing_workers, "unparsed": len(bad)}


def run_numbered(client, items, build, answer_stem, log, wait_seconds, poll_seconds):
    """Send items in batches sized to the worker limit; resend missing numbers once.

    Returns ({index: row}, batch reports). Index is the item's position in `items`.
    """
    workers = worker_limit(client)
    size = workers * ITEMS_PER_WORKER
    answers, batches = {}, []
    pending = list(range(len(items)))
    for attempt in (1, 2):
        chunks = [pending[i:i + size] for i in range(0, len(pending), size)]
        for chunk in chunks:
            number = len(batches) + 1
            path = answer_stem.with_name(f"{answer_stem.name}-{number:02d}.md")
            batch = {"number": number, "attempt": attempt, "items": len(chunk), "status": "FAILED"}
            started = time.monotonic()
            try:
                rows, meta = run_chat(client, PRIME.format(workers=workers, work=build([items[i] for i in chunk])),
                                      path, log, wait_seconds, poll_seconds)
                got = set()
                for row in rows:
                    try:
                        position = int(row.get("n")) - 1
                    except (TypeError, ValueError):
                        continue
                    if 0 <= position < len(chunk):
                        answers[chunk[position]] = row
                        got.add(position)
                missing = [chunk[i] for i in range(len(chunk)) if i not in got]
                batch.update(meta, status="OK" if not missing else "PARTIAL", missingItems=len(missing),
                             answer=path.name)
            except ExploreFailed as error:
                batch["reason"] = str(error)
                log.event("gpt_batch_failed", stem=answer_stem.name, number=number, reason=str(error))
            batch["seconds"] = round(time.monotonic() - started, 1)
            batches.append(batch)
        pending = [i for i in range(len(items)) if i not in answers]
        if not pending:
            break
    return answers, batches


def numbered(items, describe):
    return "\n".join(f"{n}. {describe(item)}" for n, item in enumerate(items, 1))


# ---------- stages ----------

def existing_open(snapshot):
    return [x for g in ("contests", "support") for x in snapshot.get(g, []) if x.get("status") in ("OPEN", "UPCOMING")]


def find_jobs(root, today):
    """Six short chats, one after another (user 2026-11-10: 2 workers at a time, short chats)."""
    manifest = json.loads((root / "data/crawler-sources.json").read_text(encoding="utf-8"))
    annual = json.loads((root / "data/annual-contests.json").read_text(encoding="utf-8"))["contests"]
    crawled = ", ".join(entry.get("name") or entry["key"] for entry in manifest.get("active", []))
    recent = [c for c in manifest.get("nextCandidates", []) if c.get("url")]
    recent.sort(key=lambda c: c.get("discoveredAt") or "", reverse=True)
    watch = "\n".join(f"- {c.get('name') or c['key']}: {c['url']}" for c in recent[:NEXT_CANDIDATES_IN_PROMPT])

    def axes(tracks):
        return "; ".join(f"{t}({', '.join(TRACK_AXES[t])})" for t in tracks)

    group_dev = ("aiData", "generalSoftware")
    group_b = ("startupSupport", "upcomingOpenings")
    pages_a = ("- 링커리어 공모전 https://linkareer.com/list/contest\n- 씽굿 https://www.thinkcontest.com/\n"
               "- 올콘 https://www.all-con.co.kr/\n- 데이콘·DAKER·AI팩토리 https://aifactory.space/\n- 소통24 https://sotong.go.kr/")
    # K-Startup's whole ongoing list is crawled (crawl_sources.mjs crawlKStartup), so it is not repeated here.
    pages_b = "- 기업마당 https://www.bizinfo.go.kr/\n- 서울창업허브·SBA https://www.startup-plus.kr/"
    annual_lines = "\n".join(f"- {a['name']}: {a['url']}" for a in annual)
    fixed = "\n".join(f'- "{name}": {url}' for name, url in FIXED_SOURCES.items())
    districts = "\n".join(f'- "{key}": {name} 공식 고시·공고와 일자리경제·창업 공지' for key, name in DISTRICTS.items())
    extra_fixed = f"고정 출처(이름 그대로) 각각을 열어 확인해라:\n{fixed}\n구청 세 곳(키 그대로):\n{districts}"
    record_fixed = ('- 고정 출처마다 {"kind":"fixedSource","name":"이름 그대로","urls":["연 주소"],"status":"CHECKED 또는 FAILED","note":"본 범위와 결과"}\n'
                    '- 구청마다 {"kind":"district","key":"nowon|dobong|gangbuk","urls":[...],"status":"CHECKED 또는 FAILED","note":"..."}\n')
    extra_annual = (f"아래 정기 대회와 창업 모집은 매번 공식 주소를 열어 이번 회차 공고가 있는지 봐라:\n{annual_lines}\n"
                    f"최근 발견된 목록 페이지도 열어 봐라:\n{watch}")
    record_annual = '- 정기 대회마다 {"kind":"annual","name":"목록 이름 그대로","url":"연 주소","status":"OPEN|UPCOMING|CLOSED|NONE|FAILED","note":"..."}\n'
    no_axes = "(트랙 구분 없음, queries 줄은 생략)"
    common = dict(today=today, scope=SCOPE_RULES, browser_rules=BROWSER_RULES, answer_rules=ANSWER_RULES)
    free = (f"위 트랙 구분 없이, 아래 사이트는 이미 다른 수집이 맡으니 출처로 쓰지 말고 여기에 없을 만한 공고를 스스로 찾아라: {crawled}. "
            "대학·공공기관·기업 자체 공고, 지역 창업센터, 해외 기관의 한국 대상 대회를 넓게 찾아라. 후보의 track은 가장 가까운 것을 골라라.")
    return [
        ("find-dev", FIND_PROMPT.format(axes=axes(group_dev), pages=pages_a, extra="", record_lines="", **common)),
        ("find-idea", FIND_PROMPT.format(axes=axes(("publicIdea",)), pages=pages_a, extra="", record_lines="", **common)),
        ("find-startup", FIND_PROMPT.format(axes=axes(group_b), pages=pages_b, extra="", record_lines="", **common)),
        ("find-fixed", FIND_PROMPT.format(axes=no_axes, pages="(아래 고정 출처)", extra=extra_fixed,
                                          record_lines=record_fixed, **common)),
        ("find-annual", FIND_PROMPT.format(axes=no_axes, pages="(아래 정기 대회)", extra=extra_annual,
                                           record_lines=record_annual, **common)),
        ("find-free", FIND_PROMPT.format(axes=no_axes, pages="(지정 없음)", extra=free, record_lines="", **common)),
    ]


def run_find(root, today, client, log, wait_seconds, poll_seconds):
    out = {"jobs": [], "rows": []}
    for name, work in find_jobs(root, today):
        path = root / f"artifacts/daily/{today}-{name}.md"
        job = {"name": name, "status": "FAILED"}
        started = time.monotonic()
        try:
            rows, meta = run_chat(client, PRIME.format(workers=worker_limit(client), work=work), path, log,
                                  wait_seconds, poll_seconds)
            for row in rows:
                row["job"] = name
            out["rows"] += rows
            job.update(meta, status="OK", lines=len(rows))
        except ExploreFailed as error:
            job["reason"] = str(error)
            log.event("find_failed", job=name, reason=str(error))
        job["seconds"] = round(time.monotonic() - started, 1)
        out["jobs"].append(job)
    return out


def run_news(root, today, client, log, wait_seconds, poll_seconds):
    cache = json.loads((root / f"data/source-cache/{today}.json").read_text(encoding="utf-8"))
    latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
    top = (cache.get("shadowSources", {}).get("hackerNewsTop", {}) or {}).get("items") or []
    hn = "\n".join(f"- {i.get('title')} {json.dumps(i.get('metrics') or {}, ensure_ascii=False)} "
                   f"{i.get('primaryUrl') or ''} {i.get('discussionUrl') or ''}" for i in top[:40])
    existing = ", ".join(x["title"][:40] for x in (latest["aiNews"][:15] + latest["aiDiscovery"][:15]))
    work = NEWS_PROMPT.format(today=today, last=latest["date"], hn=hn or "(캐시 없음)", existing=existing,
                              axes="; ".join(f"{t}({', '.join(TRACK_AXES[t])})" for t in ("aiNews", "aiDiscovery")),
                              browser_rules=BROWSER_RULES, answer_rules=ANSWER_RULES)
    path = root / f"artifacts/daily/{today}-news.md"
    started = time.monotonic()
    try:
        rows, meta = run_chat(client, PRIME.format(workers=worker_limit(client), work=work), path, log,
                              wait_seconds, poll_seconds)
        result = {"status": "OK", "rows": rows, **meta}
    except ExploreFailed as error:
        result = {"status": "FAILED", "reason": str(error), "rows": []}
        log.event("news_failed", reason=str(error))
    result["seconds"] = round(time.monotonic() - started, 1)
    return result


def clean_title(title):
    """ContestKorea prefixes the field ("아이디어•건축•창업 ") and ends titles with a count (" 0")."""
    title = re.sub(r"^\S+•\S+(?:•\S+)?\s+", "", str(title or "").strip())
    title = re.sub(r"\s+\d+$", "", title)
    return re.sub(r"\s*(오늘마감|\*.*)$", "", title).strip()


def title_key(title):
    return re.sub(r"[^0-9a-z가-힣]", "", clean_title(title).lower())


def build_candidates(root, today, details, find_rows, earlier):
    """Crawl rows and found leads that are not open items yet and were not decided in the last 14 days."""
    latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
    open_items = existing_open(latest)
    open_urls = {normalize_url(l["url"]) for x in open_items for l in x.get("links", []) if l.get("url")}
    open_titles = {title_key(x["title"]) for x in open_items}
    rows, seen = [], set()
    sources = [{"source": r["source"], "index": i, "title": r["title"], "url": r["url"], "details": r.get("details") or {},
                "listing": r.get("listing")} for i, r in enumerate(details)]
    sources += [{"source": "gpt-" + r.get("job", "find"), "track": r.get("track"), "title": r.get("title"),
                 "url": r.get("url"), "details": {"host": r.get("host"), "deadline": r.get("deadline"), "via": r.get("via")}}
                for r in find_rows if r.get("kind") == "candidate" and r.get("url") and r.get("title")]
    decided = []
    for item in sources:
        url = normalize_url(item["url"])
        key = title_key(item["title"])
        if url in open_urls or key in open_titles:
            decided.append({**item, "disposition": "EXISTING", "reason": "이미 있는 접수 중 공고"})
        elif url in earlier:
            d = earlier[url]
            disposition = "EXISTING" if d.get("disposition") == "PUBLISHED" else d.get("disposition")
            decided.append({**item, "disposition": disposition, "reason": d.get("reason") or "최근 14일 안에 처분함",
                            **({"id": d["id"]} if d.get("id") else {})})
        elif url in seen:
            decided.append({**item, "disposition": "DUPLICATE", "reason": "같은 주소 후보가 이미 있음"})
        else:
            seen.add(url)
            rows.append(item)
    return rows, decided


def describe_candidate(item):
    facts = ", ".join(f"{k}: {v}" for k, v in (item.get("details") or {}).items() if v)
    listing = " ".join(str(item.get("listing") or "").split())[:300]
    return f"{clean_title(item['title'])} | {item['url']} | {facts} | 목록 문구: {listing}"


def run_check(root, today, candidates, client, log, wait_seconds, poll_seconds):
    latest = json.loads((root / "data/latest.json").read_text(encoding="utf-8"))
    existing = "; ".join(f"{x['id']}={x['title'][:30]}" for x in existing_open(latest))[:1500]
    stem = root / f"artifacts/daily/{today}-check"

    def build(chunk):
        return CHECK_PROMPT.format(today=today, count=len(chunk), scope=SCOPE_RULES, deadline_rule=DEADLINE_RULE,
                                   existing=existing, answer_rules=ANSWER_RULES,
                                   items=numbered(chunk, describe_candidate), card_fields=CARD_FIELDS)

    answers, batches = run_numbered(client, candidates, build, stem, log, wait_seconds, poll_seconds)
    return {"answers": {str(k): v for k, v in answers.items()}, "batches": batches}
