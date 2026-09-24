#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LATEST = ROOT / "data/latest.json"
TODAY = "2026-09-24"
GENERATED_AT = "2026-09-24T09:04:47+09:00"
ARCHIVE = ROOT / f"data/archive/{TODAY}.json"

data = json.loads(LATEST.read_text(encoding="utf-8"))
if data.get("date") != "2026-09-23":
    raise SystemExit(f"Refusing to patch unexpected source date: {data.get('date')}")


def by_id(group, item_id):
    for item in data[group]:
        if item.get("id") == item_id:
            return item
    raise SystemExit(f"Missing expected {group} item: {item_id}")


def update(group, item_id, **changes):
    item = by_id(group, item_id)
    item.update(changes)
    return item


# Every previously OPEN contest was re-verified on 2026-09-24 against its
# official/primary source. dDay is advanced to today's KST calendar distance.
contest_updates = {
    "digital-solveup-2026": "D-6",
    "dacon-deepvoice-236749": "D-5",
    "dacon-blackbox-236753": "D-5",
    "dacon-koneps-236754": "D-5",
    "nebius-nvidia-global-ai-hackathon-2026": "D-37",
    "amazon-developer-hackathon-2026": "D-30",
    "opencv-ai-competition-2026": "D-33",
    "busan-ai-startup-competition-2026": "D-6",
    "knps-satellite-ai-challenge-2026": "주제3·4 D-12",
    "banana-hacks-2026": "D-18",
    "data-ai-innovation-challenge-2026": "데이터안심구역·문제해결 D-28",
    "public-web-illegal-ad-detector-2026": "D-29",
    "midnight-korea-hackathon-2026": "프로젝트 제출 D-3",
    "fintech-idea-contest-2026": "D-14",
    "space-hackathon-2026": "D-42",
    "maplestory-worlds-global-dev-contest-2026": "D-13",
    "employment24-ai-service-hackathon-2026": "D-19",
    "at-agri-price-ai-hackathon-2026": "D-19",
    "revenuecat-shipaton-2026": "D-7",
}
previous_open_contests = {x["id"] for x in data["contests"] if x.get("status") == "OPEN"}
expected_previous_open_contests = set(contest_updates) | {"habsida-hackathon-2026"}
if previous_open_contests != expected_previous_open_contests:
    raise SystemExit(
        "OPEN contest inventory changed unexpectedly: "
        f"expected={sorted(expected_previous_open_contests)} actual={sorted(previous_open_contests)}"
    )
for item_id, dday in contest_updates.items():
    update("contests", item_id, dDay=dday, lastVerifiedDate=TODAY)

# Habsida's primary Luma page now says Event Full and only offers a waitlist.
update(
    "contests",
    "habsida-hackathon-2026",
    status="CLOSED",
    dDay="정원 마감",
    deadlineText="정원 마감 · 09.24 11:00 시작",
    description="학생·직장인·프리랜서가 참가할 수 있는 인천 현장 해커톤입니다. 9월 24일 확인 기준 공식 Luma 등록이 Event Full로 전환되어 신규 참가 접수는 마감됐고 대기자 명단만 운영 중입니다.",
    lastVerifiedDate=TODAY,
    lastUpdatedDate=TODAY,
)

# Every previously OPEN support opportunity was re-verified today.
support_updates = {
    "seokyeong-bi-third-2026": "D-3",
    "gangbuk-startup-center-second-half-2026": "D-11",
    "hufs-bi-2026": "D-6",
    "suwon-prewow-academy-2026": "D-6",
    "seoul-climatetech-mentoring-2026": "D-98",
    "seoul-fintechlab2-2027-recruit-2026": "D-39",
    "dongguk-seoul-bi-sep-2026": "D-12",
    "hoseo-seoul-bi-sep-2026": "D-6",
    "yongin-startup-center-fourth-2026": "D-19",
}
previous_open_support = {x["id"] for x in data["support"] if x.get("status") == "OPEN"}
if previous_open_support != set(support_updates):
    raise SystemExit(
        "OPEN support inventory changed unexpectedly: "
        f"expected={sorted(support_updates)} actual={sorted(previous_open_support)}"
    )
for item_id, dday in support_updates.items():
    update("support", item_id, dDay=dday, lastVerifiedDate=TODAY)

# New publishable contest found through broad search + Devpost primary-source verification.
new_contest = {
    "id": "build-with-ai-basics-devpost-2026",
    "categoryLabel": "소프트웨어 개발",
    "icon": "🧩",
    "title": "Build With AI: Basics",
    "summary": "AI 코딩 에이전트용 Skill Pack을 활용해 실제 동작하는 소프트웨어 PoC를 만드는 Devpost 글로벌 온라인 해커톤",
    "description": "Devpost가 주최·운영하는 온라인 해커톤입니다. 만 18세 이상 참가자가 새 소프트웨어 프로젝트를 만들고 공개 코드 저장소, 작동 데모와 짧은 영상을 제출합니다. Claude Code·Codex·Cursor·Copilot 등 SKILL.md를 지원하는 코딩 에이전트에서 공식 Skill Pack을 사용할 수 있습니다.",
    "dDay": "D-33",
    "deadlineText": "10.27 06:00 KST",
    "tags": ["소프트웨어 개발", "AI 코딩", "개인 참가", "온라인", "Devpost"],
    "period": "등록·제출 2026.09.22 10:00 ET ~ 10.26 17:00 ET (한국시간 10.27 06:00)",
    "reward": "총 현금상금 $2,500 · 1위 $1,250 · 2위 $750 · 3위 $500",
    "participation": "만 18세 이상. 한국을 포함한 대부분 국가·지역의 개인·팀 참가 가능(Devpost 표준 제외 지역 적용)",
    "preStartup": "사업자등록 없이 개인 참가 가능",
    "employment": "재직자 제한 명시 없음. 주최·운영 관련자 등 공식 규칙상 제외 대상은 적용",
    "businessRegistration": "개인 참가 시 사업자등록 요구 없음",
    "evaluation": "디자인 · 잠재 영향 · 아이디어/혁신 · 프레젠테이션을 중심으로 심사. 새 프로젝트의 작동 결과물, 공개 코드 저장소, 1~3분 데모 영상 등을 제출",
    "aiSupport": "Devpost Learn의 무료 AI Skill Pack과 라이브 빌드 세션·오피스아워 제공. 별도 유료 모델/API 크레딧 지원은 명시 없음",
    "ideas": [
        "지원사업·공모전 공고를 읽고 자격·마감·준비서류를 근거와 함께 정리하는 개인 코파일럿",
        "Spring Boot 장애 로그에서 재현 단계와 수정 후보를 만드는 소형 개발자 도구",
        "회의 메모를 결정사항·담당자·다음 행동으로 바꾸고 변경 이력을 남기는 업무 자동화 앱"
    ],
    "links": [
        {"label": "Devpost 공식 페이지", "url": "https://learn-ai-basics.devpost.com/"},
        {"label": "공식 규칙", "url": "https://learn-ai-basics.devpost.com/rules"},
        {"label": "공식 리소스", "url": "https://learn-ai-basics.devpost.com/resources"}
    ],
    "firstSeenDate": TODAY,
    "status": "OPEN",
    "lastVerifiedDate": TODAY,
    "lastUpdatedDate": TODAY
}
if not any(x.get("id") == new_contest["id"] for x in data["contests"]):
    data["contests"].append(new_contest)

# New support opportunity: useful to an individual/pre-founder and nationwide/online.
new_support = {
    "id": "ai-solo-founder-camp-7-2026",
    "categoryLabel": "창업 · 지원사업",
    "icon": "🤖",
    "title": "AI 기반 서비스 개발·사업화 1인 창업가 캠프 7기",
    "summary": "예비·초기 창업자가 AI로 서비스 MVP를 직접 개발하고 사업화까지 이어가도록 돕는 120일 온라인 국비지원 부트캠프",
    "description": "넥스트러너스가 운영하는 예비·초기 창업가 대상 과정입니다. 내일배움카드 소지자 또는 발급 가능자가 AI 기반 서비스 개발, MVP 검증, 수익화와 1인 SaaS·자동화 서비스 사업화를 학습합니다. 교육은 100% 온라인으로 진행됩니다.",
    "dDay": "D-1",
    "deadlineText": "09.25 · 마감시각 원문 확인",
    "tags": ["예비창업자", "전국", "AI 서비스", "1인 창업", "국비지원"],
    "period": "신청 2026.08.01 ~ 09.25 / 교육 2026.10.01 ~ 2027.03.26 (평일 10:00~19:00, 100% 온라인)",
    "reward": "총 교육비 9,113,280원 중 국비 최대 8,710,000원(최대 96%) 지원 · 자부담 400,000원 · 요건 충족 시 훈련장려금 월 최대 30만원. 세부 지급·부가 혜택은 원 공고 확인",
    "participation": "내일배움카드 소지자 또는 발급 가능한 만 20세 이상 예비·초기 창업가 중심. AI로 직접 서비스 출시·1인 SaaS·자동화 사업화를 준비하는 신청자",
    "preStartup": "가능. 아이디어 단계 예비창업자 포함",
    "employment": "재직자 제한 자체는 공고 요약에서 명시되지 않음. 내일배움카드 발급·수강 가능 여부는 개인별 확인 필요",
    "businessRegistration": "예비창업자 신청 가능하므로 신청 시 사업자등록 필수 아님. 기창업자는 업력 등 세부조건 확인 필요",
    "evaluation": "온라인 신청서 → 서류심사 → 필요 시 약 5분 유선 인터뷰 → 선발 → HRD-Net 수강신청",
    "aiSupport": "AI 활용 개발교육·MVP 제작·사업화 멘토링 제공. 공고 요약상 유료 AI 툴 등 학습 인프라 지원이 안내되며 정확한 제공 범위는 운영기관 원문 확인",
    "ideas": [
        "DuelTown 같은 오프라인 현장매칭 서비스의 작은 MVP를 직접 출시하고 사용자 검증",
        "사내 문서·규정 검색을 돕는 소형 권한기반 RAG SaaS",
        "개발팀 반복업무를 줄이는 1인 B2B 자동화 SaaS"
    ],
    "links": [
        {"label": "K-Startup 공식 공고", "url": "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=178831"}
    ],
    "firstSeenDate": TODAY,
    "status": "OPEN",
    "lastVerifiedDate": TODAY,
    "lastUpdatedDate": TODAY
}
if not any(x.get("id") == new_support["id"] for x in data["support"]):
    data["support"].append(new_support)

# Fresh primary-source AI news published on 2026-09-23 and discovered today.
new_ai_news = [
    {
        "id": "openai-mentalhealthbench-2026-09-23",
        "categoryLabel": "AI 뉴스",
        "icon": "🧪",
        "title": "OpenAI, MentalHealthBench 공개…80명+ 전문가가 AI 정신건강 응답 평가",
        "summary": "80명이 넘는 면허 보유 정신건강 전문가와 만든 공개 벤치마크로 현실적인 상담 대화에서 AI 응답의 도움됨·안전성을 평가합니다.",
        "description": "OpenAI가 22개국 80명 이상의 면허 보유 정신건강 전문가와 MentalHealthBench를 공개했습니다. 일상적인 고민부터 고위험·응급 상황까지 성인·청소년·보호자·임상의 관점을 포함해 안전성, 맥락 확인, 사용자 주도성 보존, 실행 가능한 안내 등을 평가하며 벤치마크는 외부에서도 재사용할 수 있게 공개됩니다.",
        "why": "헬스케어처럼 고위험 도메인에서 범용 helpfulness 점수만으로는 부족합니다. 전문가 기준과 실제 대화 맥락을 분리해 평가하는 공개 벤치마크가 생기면서 도메인 AI의 사전·회귀 평가 설계에 직접 참고할 수 있습니다.",
        "updatedAgo": "오늘",
        "tags": ["OpenAI", "Benchmark", "AI Safety", "Healthcare", "Evaluation"],
        "ideas": [
            "고위험 도메인 챗봇의 응답을 안전성·맥락확인·행동가능성 축으로 나눠 회귀평가",
            "RAG 답변의 사실성 외에 사용자의 선택권을 침해하지 않는지 별도 평가하는 품질 게이트"
        ],
        "links": [{"label": "OpenAI 공식 발표", "url": "https://openai.com/index/introducing-mentalhealthbench/"}],
        "firstSeenDate": TODAY,
        "lastUpdatedDate": TODAY,
        "updates": [{"date": "2026-09-23", "label": "공개", "text": "OpenAI가 80명 이상의 면허 보유 정신건강 전문가와 현실적인 정신건강 대화를 평가하는 공개 벤치마크 MentalHealthBench를 발표했습니다."}]
    },
    {
        "id": "anthropic-claude-enzyme-discovery-2026-09-23",
        "categoryLabel": "AI 뉴스",
        "icon": "🧬",
        "title": "Anthropic, Claude가 CRISPR 유사 반복구조의 새 효소 시스템을 찾아낸 초기 연구 공개",
        "summary": "Claude 에이전트가 대규모 DNA·단백질 데이터 탐색에서 후보를 좁혀 실험실 검증으로 이어진 새 효소 시스템을 발견했다고 Anthropic이 공개했습니다.",
        "description": "Anthropic이 생명과학 연구그룹과 자체 실험실을 소개하며 초기 결과를 공개했습니다. Claude는 20만 개가 넘는 reverse transcriptase를 수집·분석해 수천 후보를 거쳐 실험 대상을 좁혔고, DNA 반복 배열과 연관된 새로운 효소 시스템을 찾아냈습니다. CRISPR를 연상시키는 패턴이지만 정확한 생물학적 기능은 추가 실험 중입니다.",
        "why": "AI for Science가 문헌 요약을 넘어 대규모 데이터 탐색→가설 생성→wet-lab 실험 대상을 정하는 루프로 이동한 사례입니다. 다만 기능은 아직 확정된 발견으로 보지 않고 초기 연구 결과로 해석해야 합니다.",
        "updatedAgo": "오늘",
        "tags": ["Anthropic", "Claude", "AI for Science", "Biology", "Agent"],
        "ideas": [
            "대규모 기술문서·코드 후보를 에이전트가 넓게 탐색하고 검증 비용이 큰 소수 후보만 사람에게 올리는 연구 워크플로우",
            "에이전트의 가설·근거·실험 결과를 연결해 실패한 후보까지 추적 가능한 실험 로그 설계"
        ],
        "links": [{"label": "Anthropic 공식 발표", "url": "https://www.anthropic.com/news/claude-discovers-novel-enzyme-system"}],
        "firstSeenDate": TODAY,
        "lastUpdatedDate": TODAY,
        "updates": [{"date": "2026-09-23", "label": "초기 연구 공개", "text": "Anthropic이 Claude가 대규모 생명과학 데이터 탐색에서 CRISPR 유사 반복 배열과 연관된 새 효소 시스템 후보를 찾아 실험실 연구로 연결한 초기 결과를 공개했습니다."}]
    },
    {
        "id": "google-private-ai-compute-memory-2026-09-23",
        "categoryLabel": "AI 뉴스",
        "icon": "🔐",
        "title": "Google DeepMind, Private AI Compute에 안전한 서버측 장기 메모리 설계 공개",
        "summary": "기기 간에 이어지는 AI 장기 메모리를 서버에 유지하면서 온디바이스 수준의 프라이버시 기준을 지향하는 Private AI Compute 아키텍처를 공개했습니다.",
        "description": "Google DeepMind의 Private AI Compute 팀이 지속적이고 기기간 연속성을 갖는 AI 메모리를 위한 서버측 메모리 구조를 공개했습니다. 개인화 에이전트가 여러 기기에서 맥락을 이어갈 수 있게 하면서도 데이터 접근과 처리 경계를 강화해 온디바이스 처리에 가까운 프라이버시 특성을 목표로 합니다.",
        "why": "개인화 에이전트의 장기 메모리는 유용하지만 서버에 저장되는 순간 프라이버시·권한 문제가 커집니다. 메모리 기능을 제품화할 때 저장 위치·접근통제·기기간 동기화를 별도 보안 아키텍처로 다뤄야 한다는 신호입니다.",
        "updatedAgo": "오늘",
        "tags": ["Google DeepMind", "Privacy", "AI Memory", "Agent", "Infrastructure"],
        "ideas": [
            "장기 메모리를 원문·요약·민감도 등급으로 분리하고 도구별 읽기 권한을 제한하는 에이전트 메모리 계층",
            "로컬 우선 저장과 서버측 암호화 메모리를 조합해 기기간 동기화 시 노출 범위를 최소화하는 PoC"
        ],
        "links": [{"label": "Google DeepMind 공식 글", "url": "https://deepmind.google/blog/advancing-private-ai-compute-with-secure-server-side-memory/"}],
        "firstSeenDate": TODAY,
        "lastUpdatedDate": TODAY,
        "updates": [{"date": "2026-09-23", "label": "아키텍처 공개", "text": "Google이 Private AI Compute에서 지속적·기기간 AI 메모리를 제공하면서 온디바이스 수준 프라이버시 기준을 지향하는 서버측 메모리 설계를 공개했습니다."}]
    }
]
existing_ai_ids = {x.get("id") for x in data["aiNews"]}
for item in new_ai_news:
    if item["id"] not in existing_ai_ids:
        data["aiNews"].append(item)

# Same GitHub Copilot topic: merge the Sep 23 local-sandboxing follow-up instead of duplicating it.
gh = by_id("aiNews", "github-copilot-sep18-agent-review-models-2026")
gh["summary"] = "Copilot 코드리뷰 멀티에이전트·모델 라우팅 강화에 이어, 로컬 세션의 파일·네트워크·자격증명 접근을 제한하는 프로젝트별 샌드박싱이 추가됐습니다."
gh["description"] = gh["description"].rstrip() + " 9월 23일에는 Copilot app 로컬 저장소 세션에서 파일시스템·네트워크·Git/GitHub 자격증명 접근을 프로젝트별로 제한하는 로컬 샌드박싱이 public preview로 추가됐습니다. OS가 요청 정책을 강제하지 못하면 샌드박스 없이 실행하지 않고 실패하도록 설계됐습니다."
gh["lastUpdatedDate"] = TODAY
gh["updatedAgo"] = "오늘"
if not any(u.get("date") == "2026-09-23" and u.get("label") == "로컬 샌드박싱" for u in gh.get("updates", [])):
    gh.setdefault("updates", []).append({
        "date": "2026-09-23",
        "label": "로컬 샌드박싱",
        "text": "GitHub Copilot app에 프로젝트별 파일시스템·네트워크·Git/GitHub 자격증명 접근을 제한하는 로컬 샌드박싱 public preview가 추가됐습니다."
    })
if not any(l.get("url") == "https://github.blog/changelog/2026-09-23-local-sandboxing-in-the-github-copilot-app/" for l in gh.get("links", [])):
    gh.setdefault("links", []).append({
        "label": "Copilot app 로컬 샌드박싱",
        "url": "https://github.blog/changelog/2026-09-23-local-sandboxing-in-the-github-copilot-app/"
    })

# Daily snapshot metadata and exact latest/archive identity.
data["date"] = TODAY
data["generatedAt"] = GENERATED_AT
data["archive"] = [TODAY] + [d for d in data.get("archive", []) if d != TODAY]

# Final invariants before serialize.
all_ids = [x["id"] for group in ("contests", "support", "aiNews") for x in data[group]]
if len(all_ids) != len(set(all_ids)):
    raise SystemExit("Duplicate IDs after merge")
for item in data["contests"] + data["support"]:
    if item.get("status") == "OPEN" and item.get("lastVerifiedDate") != TODAY:
        raise SystemExit(f"OPEN item not reverified today: {item['id']}")

text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
LATEST.write_text(text, encoding="utf-8")
ARCHIVE.write_text(text, encoding="utf-8")
print(f"WROTE {TODAY}: {len(data['contests'])} contests, {len(data['aiNews'])} aiNews, {len(data['support'])} support")
