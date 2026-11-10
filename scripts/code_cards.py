#!/usr/bin/env python3
"""Cards written by code from crawled fields (user 2026-11-10: "코드로바꿔").

GPT card writing took about four minutes per ten items and 764 candidates on 11-10
would have taken five hours. Every field here comes from what the crawler read; a field
it did not read is "확인 필요". The answers use the same shape as the GPT check so
assemble_brief.py builds the brief unchanged.
"""

import re
from datetime import date, timedelta
from urllib.parse import urlsplit

# Out of scope (AUTOMATION.md "Editorial selection"): naming, literature, video/photo,
# art/design/webtoon, and events or roles that are not calls.
OUT_OF_SCOPE = re.compile(
    r"영상|숏폼|쇼츠|UCC|사진|디자인|웹툰|일러스트|캐릭터|네이밍|슬로건|표어|문학|백일장|수기|시나리오|웹소설|소설|"
    r"음악|작곡|댄스|노래|미술|그림|서포터즈|기자단|홍보대사|봉사|마케터|체험단|공연|포스터|굿즈|광고|글짓기|에세이|"
    r"독후감|스피치|말하기|토론|사생대회|채용|인턴십|직원 모집|강사 모집")
# Not calls to enter (training, events, scholarships), unless the title is about a startup.
NOT_A_CALL = re.compile(r"트레이닝|교육생|수강생|DevDay|세미나|컨퍼런스|설명회|박람회|특강|부트캠프|장학|채용박람회|"
                        r"수요조사|성과공유회|공유회|간담회|네트워킹", re.I)
DEV_AI = re.compile(r"AI|인공지능|데이터|해커톤|개발|소프트웨어|SW|앱|웹|코딩|프로그래밍|보안|알고리즘|LLM|에이전트", re.I)
AGGREGATORS = ("contestkorea.com", "wevity.com", "linkareer.com", "grantly.kr", "k-startup.go.kr", "sotong.go.kr", "modu.go.kr",
               "koreahackathons.com", "daker.ai", "campuspick.com")
SUPPORT_SOURCES = {"kStartupHighlights", "grantlySupport"}
# Campuspick runs tags, title and organizer together with no separator; its calls are
# mostly on Linkareer, so it is not used for cards.
SKIP_SOURCES = {"campuspick"}
ISO = re.compile(r"(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})")


def iso(y, m, d):
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def dates_in(text):
    return [v for v in (iso(*m) for m in ISO.findall(text or "")) if v]


def d_day(text, today):
    """"D-8" → today + 8; "D-DAY"/"오늘마감" → today."""
    if re.search(r"D-?DAY|오늘\s*마감", text or "", re.I):
        return today.isoformat()
    m = re.search(r"D-(\d{1,3})\b", text or "")
    return (today + timedelta(days=int(m.group(1)))).isoformat() if m else None


def between(text, start, end):
    m = re.search(start + r"\s*(.*?)\s*" + end, text or "")
    return m.group(1).strip() if m else None


def fields(row, today):
    """Title, host, deadline, period, target, prize, homepage read from one crawl row."""
    source, raw = row["source"], " ".join(str(row.get("listing") or "").split())
    detail = row.get("details") or {}
    out = {"title": row["title"], "host": None, "deadline": None, "period": None, "target": None,
           "prize": None, "homepage": None, "tags": []}
    if source in ("contestKorea", "wevity"):
        out["title"] = re.sub(r"^\S+•\S+(?:•\S+)?\s+|\s+\d+$", "", row["title"]).strip()
        period = detail.get("period")
        out.update(host=detail.get("host"), target=detail.get("target"), prize=detail.get("prize"),
                   homepage=detail.get("homepage"), period=period)
        found = dates_in(period)
        out["deadline"] = found[-1] if found else d_day(raw, today)
    elif source == "kStartupHighlights":
        found = re.search(r"마감일자\s*(20\d{2}-\d{2}-\d{2})", raw)
        out["deadline"] = found.group(1) if found else None

        # "…title title organization 등록일자 … 마감일자 … 조회 N" (or "… organization 조회 N").
        tail = raw.split(row["title"])[-1]
        host = re.split(r"\s*(?:등록일자|조회)", tail)[0].replace("통합공고", "")
        # The crawler reads the organization line; otherwise the last word before the dates.
        words = host.split()
        out["host"] = row.get("host") or (words[-1].strip(" ·") if words else None)
        found = re.search(r"(공공|민간|교육)?\s*(\S+)\s+(?:D-|오늘마감)", raw)
        out["tags"] = [found.group(2)] if found else []
    elif source == "linkareer":
        # "<n> title 담당자 답변받기|담당자 답변 <n> [팀원 모집 <n>] organization D-<n> 조회 …"
        out["title"] = re.split(r"\s*담당자 답변", re.sub(r"^\d+\s+", "", row["title"]))[0].strip()
        out["host"] = between(raw, r"담당자 답변(?:받기|\s*\d+)(?:\s*팀원 모집\s*\d+)?", r"D-?(?:\d+|DAY)")
        out["deadline"] = d_day(raw, today)
    elif source == "grantlySupport":
        m = re.match(r"(.*?) · (\d{1,2})월 (\d{1,2})일 마감 (.*)", raw)
        if m:
            out.update(host=m.group(1), title=m.group(4), deadline=iso(today.year, m.group(2), m.group(3)))
    elif source == "sotong24Contests":
        found = dates_in(raw)
        out["deadline"] = found[1] if len(found) > 1 else None
        out["period"] = f"{found[0]} ~ {found[1]}" if len(found) > 1 else None
        out["host"] = between(raw, "【", "】")
        out["title"] = re.sub(r"^\[.*?\]\s*【.*?】\s*", "", row["title"]).strip()
    elif source.startswith("gpt-"):
        # Free-exploration leads arrive with GPT's host and deadline (gpt_jobs FIND_PROMPT candidate line).
        found = dates_in(str(detail.get("deadline") or ""))
        out.update(host=detail.get("host"), deadline=found[-1] if found else None,
                   homepage=row["url"] if official(row["url"]) else None)
    elif source == "dakerHackathons":
        out["deadline"] = d_day(raw, today)
        out["prize"] = between(raw, "총 상금", " ")
    return out


def official(url):
    host = (urlsplit(url or "").hostname or "").lower()
    return bool(host) and not any(host == a or host.endswith("." + a) for a in AGGREGATORS)


def category_label(support, title):
    """Labels the site sorts by; "공모전 · 해커톤" alone put every card under software (2026-11-10)."""
    if support:
        return "창업 · 지원사업"
    if re.search(r"AI|인공지능|데이터", title, re.I):
        return "AI · 데이터"
    if DEV_AI.search(title):
        return "공모전 · 개발"
    return "공모전 · 아이디어"


def card_for(row, f, today):
    support = row["source"] in SUPPORT_SOURCES or row.get("track") == "startupSupport"
    deadline = [f["deadline"]] if f["deadline"] else "확인 필요"
    deadline_text = f["deadline"] or "확인 필요"
    host = f["host"] or "확인 필요"
    links = []
    if f["homepage"] and official(f["homepage"]):
        links.append({"label": "공식 홈페이지", "url": f["homepage"]})
    links.append({"label": "공고", "url": row["url"]})
    summary = f"주최 {host} · 마감 {deadline_text}"
    if f["prize"]:
        summary += f" · {f['prize'][:40]}"
    return {
        "id": f"{row['source'].lower()}-{re.sub(r'[^0-9]', '', row['url'])[-12:] or 'item'}",
        "title": f["title"][:120],
        "summary": summary,
        "description": "모음 사이트에 적힌 정보로 만든 카드입니다. 자세한 조건은 공고 링크에서 확인하세요.",
        "categoryLabel": category_label(support, f["title"]),
        "icon": "💼" if support else "🏆",
        "tags": [t for t in f["tags"] if t][:3] or (["개발·AI"] if DEV_AI.search(f["title"]) else []),
        "period": f["period"] or "확인 필요",
        "deadlineText": deadline_text,
        "deadline": deadline,
        "participation": f["target"] or "확인 필요",
        "reward": f["prize"] or "확인 필요",
        "businessRegistration": "확인 필요",
        "preStartup": "확인 필요",
        "employment": "확인 필요",
        "evaluation": "확인 필요",
        "aiSupport": "확인 필요",
        "ideas": [],
        "links": links,
        "status": "OPEN",
    }


def track_for(row, f):
    if row.get("track") in ("aiData", "generalSoftware", "publicIdea", "startupSupport", "upcomingOpenings"):
        return row["track"]
    if row["source"] in SUPPORT_SOURCES:
        return "startupSupport"
    if DEV_AI.search(f["title"]):
        return "aiData" if re.search(r"AI|인공지능|데이터", f["title"], re.I) else "generalSoftware"
    return "publicIdea"


def answers(candidates, today_text):
    """{position: answer} in the GPT check's shape, for assemble_brief.assemble."""
    today = date.fromisoformat(today_text)
    out = {}
    for position, row in enumerate(candidates):
        if row["source"] in SKIP_SOURCES:
            out[str(position)] = {"disposition": "NOT_RELEVANT", "reason": "코드 카드 대상이 아닌 출처"}
            continue
        f = fields(row, today)
        text = f"{f['title']} {' '.join(f['tags'])}"
        if OUT_OF_SCOPE.search(text) or (NOT_A_CALL.search(text) and "창업" not in text):
            out[str(position)] = {"disposition": "NOT_RELEVANT", "reason": "범위 밖 분야(영상·디자인·네이밍·문학 등)"}
        elif f["deadline"] and f["deadline"] < today_text:
            out[str(position)] = {"disposition": "CLOSED", "reason": f"마감 {f['deadline']} 지남"}
        else:
            out[str(position)] = {"disposition": "PUBLISHED", "card": card_for(row, f, today),
                                  "official": bool(f["homepage"] and official(f["homepage"])),
                                  "track": track_for(row, f)}
    return out
