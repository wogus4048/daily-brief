# daily-brief automation contract

The single active `daily-brief 매일 갱신` automation owns the full refresh. It updates data only unless the user explicitly asks for UI changes.

## Data model

The main file is `data/latest.json` with:
- `date`
- `generatedAt`
- `contests`
- `aiNews`
- `support`
- `archive`

All three content arrays are cumulative catalogs, not replace-every-day feeds.

### Opportunities: contests / support

Keep an item once discovered. Use a stable `id` across days.

Required tracking fields:
- `firstSeenDate`: first day the item was added. Never reset it.
- `status`: `OPEN` or `CLOSED`.
- `lastVerifiedDate`: last day the official source was checked.
- `lastUpdatedDate`: change only when meaningful content changes.

Classification:
- Contest discovery MUST distinguish AI/data competitions from general software-building opportunities.
- Prefer these stable contest category labels when applicable: `AI · 데이터`, `소프트웨어 개발`, `앱 · 웹 서비스`, `보안`, `핀테크`, `공공데이터`, `스타트업 · 프로덕트`.
- Do not label a general software/app/web hackathon as AI just because AI could optionally be used.
- `support` is a separate catalog for startup/support opportunities such as pre-startup programs, commercialization funding, incubation/education, accelerators, PoC/validation, office/space support, cloud/GPU/API credits, and developer/startup benefit programs.

Do not delete an opportunity just because today's search did not surface it. Re-check the official source. When registration closes or the deadline passes, set `status: CLOSED` and keep it in the cumulative catalog so history remains searchable.

### AI news

AI news is also cumulative. Do not create a second card for the same underlying product/release/topic when a follow-up appears.

Required tracking fields:
- `firstSeenDate`
- `lastUpdatedDate`
- `updates[]`

Each update entry has at least:
- `date`
- `label`
- `text`

When a meaningful follow-up appears, update the existing item's summary/description/why/links as needed, append a new `updates[]` entry, and advance `lastUpdatedDate`. Do not append an update for a routine daily re-check when nothing changed.

Treat duplicate titles, official URLs, product/project names, and topic continuity as signals for merge instead of creating a new item.

## Discovery

Fixed source lists are starting points, never a whitelist.

Run opportunity discovery as independent tracks. Finding many candidates in one track never permits skipping another.

For AI/data contests:
- Search generative AI, RAG/LLM, agents, ML, data analysis, computer vision, speech, and AI service competitions.
- Gather at least 10 raw candidates or exhaust multiple search/source axes.

For general software contests/hackathons:
- Search independently from AI using terms such as software contest, developer hackathon, app development, web service, mobile app, backend/API, cloud/DevOps, security, fintech, blockchain, games, IoT, public-data service, open source, SaaS, product-building and automation.
- Prefer opportunities requiring an actual app/web/program/API/prototype/MVP/code submission.
- Gather at least 15 raw candidates or exhaust multiple search/source axes.
- If current OPEN contests are dominated by AI, run this non-AI software track again before finishing.

For startup/support programs:
- Search independently from contests. Include programs like 모두의 창업 프로젝트, 예비창업패키지-style programs, commercialization grants, startup education/incubation, accelerators, PoC/validation, workspace, mentoring, investment linkage, SBA/Seoul programs, K-Startup, 기업마당, NIPA/KISA, fintech startup support, and cloud/GPU/API/SaaS credits.
- Gather at least 15 raw candidates or exhaust K-Startup, 기업마당, SBA, NIPA, KISA, fintech support sources and unrestricted web search.
- `support` may be empty only after this independent search is genuinely exhausted; a large contest pool is never a reason to skip it.

For all opportunity tracks:
- Start with unrestricted web search and inspect new domains.
- Also check DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea, K-Startup, 기업마당, Luma/EventUs/온오프믹스/Devpost/Meetup and official organizer pages.
- Gather a broad raw candidate pool before applying filters.

For AI news:
- Search broadly across the web, GitHub releases/repos, Hugging Face, arXiv/research labs, official product updates, and developer communities.
- Do not limit discovery to major AI vendors.

Discovery/community sources are for finding leads. Final published facts should be verified against primary official sources whenever available.

## Eligibility

Publish opportunities the user can realistically enter:
- individual / one-person team, or eligible pre-startup applicant without required existing business registration
- nationwide / online / Seoul / capital-region accessible
- no explicit employee ban or full-time exclusivity
- for startup/support programs, verify current-business-registration rules, past business-history restrictions, employee/side-job restrictions, and whether business registration becomes mandatory after selection
- record whether cash support can officially be used for development, SaaS, cloud, GPU, API or AI expenses; when not stated, mark it as requiring confirmation

Exclude existing-company-only programs and non-capital regional-only programs requiring local company/residence. If eligibility remains ambiguous after checking official notices/FAQ, do not publish it.

It is valid for `support` to be empty.

## Today indicators

- `오늘 신규 N건` means `firstSeenDate == snapshot date`.
- `오늘 업데이트 N건` means `lastUpdatedDate == snapshot date` and `firstSeenDate != snapshot date`.
- Existing items that were merely re-verified do not count as new or updated.
- Opportunity navigation counts should represent currently `OPEN` opportunities; cumulative closed history remains available in category pages.

## Archive

Save the complete final snapshot for the current day to `data/archive/YYYY-MM-DD.json`.
The current day's archive must exactly match `data/latest.json`.
Do not rewrite older archive files.

## Failure safety

If broad discovery, official pages, or a tool partially fails:
- do not replace healthy existing cumulative data with empty/incomplete arrays
- preserve previously verified active items
- retry when possible
- only remove or close items based on verified evidence

## Validation and deployment

- Validate with `scripts/validate_data.py`.
- Commit the completed snapshot to `main`.
- Every push triggers `.github/workflows/pages.yml`.
- A successful commit is not the same as a successful site refresh; verify both validate and deploy jobs when possible.
- Do not send Slack messages for normal refreshes. Report only failures needing user attention.
