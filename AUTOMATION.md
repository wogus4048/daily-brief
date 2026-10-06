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

## Research evidence gate

Every scheduled refresh must also write `data/research/YYYY-MM-DD.json`. This is not optional logging; it is promotion evidence.

The audit must record:
- `date`, `completedAt`
- `reverifiedIds`: every previously OPEN/UPCOMING contest/support id actually re-opened and checked
- `publishedIds`: every newly published contest/support/AI-news id for the snapshot date
- independent track evidence for `aiData`, `generalSoftware`, `publicIdea`, `startupSupport`, `upcomingOpenings`, and `aiNews`
- for each track, the actual queries grouped by required search axis, raw candidate titles/URLs, and disposition (`PUBLISHED`, `EXISTING`, `DUPLICATE`, `INELIGIBLE`, `CLOSED`, `NOT_RELEVANT`)
- fixed-source evidence for every mandatory source family, including checked URLs or a concrete failure reason
- district evidence for 노원, 도봉, 강북, including checked URLs or a concrete failure reason

The audit is validated by `scripts/validate_research_audit.py`. A refresh is incomplete if the audit is missing, if a required search axis has no executed query evidence, if required source/district evidence is missing, if the raw-candidate minimum was neither met nor explicitly exhausted with a reason, or if a previously OPEN/UPCOMING id was not re-verified.

Do not fabricate audit evidence. Record only queries, URLs, candidates and checks actually performed in the current run.

### Opportunities: contests / support

Keep an item once discovered. Use a stable `id` across days.

Required tracking fields:
- `firstSeenDate`: first day the item was added. Never reset it.
- `status`: `UPCOMING`, `OPEN`, or `CLOSED`.
- `openingAt`: required for `UPCOMING`; exact scheduled application opening time in ISO 8601 with timezone when officially known.
- `lastVerifiedDate`: last day the official source was checked.
- `lastUpdatedDate`: change only when meaningful content changes.

Classification:
- Contest discovery MUST distinguish AI/data competitions from general software-building opportunities.
- Prefer these stable contest category labels when applicable: `AI · 데이터`, `소프트웨어 개발`, `앱 · 웹 서비스`, `보안`, `핀테크`, `공공데이터`, `스타트업 · 프로덕트`.
- Do not label a general software/app/web hackathon as AI just because AI could optionally be used.
- `support` is a separate catalog for startup/support opportunities such as pre-startup programs, commercialization funding, incubation/education, accelerators, PoC/validation, office/space support, cloud/GPU/API credits, and developer/startup benefit programs.

Do not delete an opportunity just because today's search did not surface it. Re-check the official source. Use `UPCOMING` when an officially announced opportunity is not accepting applications yet but has a known future opening time/date and is relevant to act on in advance, especially same-day/next-24-hour or first-come openings. Change `UPCOMING` to `OPEN` after the official opening time is reached and the application page is available. When registration closes or the deadline passes, set `status: CLOSED` and keep it in the cumulative catalog so history remains searchable.

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

For public/idea/industry-specialized contests:
- Search independently from AI/data and code-heavy hackathons for `아이디어 공모전`, `국민참여 공모`, `서비스 기획 공모전`, `혁신 아이디어`, `산업 아이디어 공모전`, `기술·제품 공모전`, and combinations with `개인 참가`, `국민 누구나`, `상금`, `PoC`, `앱/웹`, `서비스`.
- Include government ministries, public agencies, public corporations, sports/culture/transport/finance/identity and other industry-specific organizers when an individual can realistically enter.
- Do not exclude a strong opportunity merely because a finished code submission is not mandatory. Idea/proposal-first contests belong in `contests` when they offer meaningful prize money, portfolio value, expert feedback, PoC support, commercialization, or product-building relevance.
- Prefer items where an individual can enter directly; record whether PoC/prototype/demo is optional or mandatory.
- Gather at least 10 materially distinct raw candidates or exhaust the relevant government/public and industry-specific source axes.

### Structured source enumeration

For source sites that expose a finite "ongoing/current/open" listing, do not treat opening the site or finding one result as a completed source check. Enumerate the listing and disposition every visible current item before marking the source checked.

DACON is mandatory and stricter:
- Open the DACON homepage directly, not only search-engine results.
- Enumerate every card currently visible under both `데이커: 진행 중인 해커톤` and `진행 중인 경진대회`.
- Follow every potentially relevant card to its detail/official page and determine whether it is `PUBLISHED`, `EXISTING`, `DUPLICATE`, `INELIGIBLE`, `CLOSED`, or `NOT_RELEVANT`.
- Record every enumerated card in `data/research/YYYY-MM-DD.json -> fixedSources.DACON.inventory[]` with `section`, `title`, `url`, and `disposition`.
- A DACON source check is incomplete if even one live homepage ongoing-card URL is absent from the audit inventory. `scripts/validate_research_audit.py` independently fetches the DACON homepage during promotion and blocks the refresh when the inventory is incomplete.
- DACON/Daker items must still pass the same user-eligibility and primary-source verification rules before publication.

For all opportunity tracks:
- Start with unrestricted web search and inspect new domains.
- Also check DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea, K-Startup, 기업마당, Luma/EventUs/온오프믹스/Devpost/Meetup and official organizer pages.
- Also check 소통24 공모전, 대한민국 정책브리핑/정부부처 보도자료·공고, 공공기관·지자체 공모전 게시판, and industry-specific official contest pages as a safety net for public idea competitions that do not appear on developer-focused platforms.
- Treat recurring high-value organizer/event sites as a watchlist even before applications open. At minimum, check `aitop100.org` (AI_TOP_100), Kakao Impact, and Brian Impact for newly announced AI competitions or application-opening countdowns.
- Gather a broad raw candidate pool before applying filters.


### Mandatory Seoul northeast district-source track
Treat the following local-government sources as mandatory daily checks, not optional discovery leads:
- 노원구청 (nowon.kr): 공지사항, 고시공고, 온라인접수/통합접수, 청년정책 and 노원청년포털/청년시설소식
- 도봉구청 (dobong.go.kr): 행사모집/공지, 청년정책, 청년미래과, 청년창업센터, 도봉복지로의 신청형 프로그램
- 강북구청 (gangbuk.go.kr): 새소식, 고시공고, 일자리청년과, 지역경제과, 청년일자리센터 and 신청/모집 공고

Search these three districts independently every refresh even when unrestricted web search found enough candidates elsewhere. For each district, look specifically for:
- 청년·취업·직무역량·자격증·AI/개발/디지털 교육
- 예비창업·초기창업·창업공간·점포·사무실·사업화·멘토링·컨설팅
- 개인/1인팀이 참여 가능한 공모전, 아이디어 경진대회, 해커톤, 마켓/셀러 기회
- 현금·바우처·응시료·주거/공간·교육비 등 실질 지원
- 서울시/유관기관 사업을 구청이 재공고한 경우에도 현재 신청 가능하면 후보로 수집

Do not publish generic festivals, leisure classes, children-only programs, unrelated welfare notices, or generic language/certification exam-fee reimbursements merely because they are open. Publish only items that materially fit the user's opportunity profile. Prefer opportunities that materially advance software/AI skills, job access, portfolio building, startup execution, workspace access, commercialization, funding, PoC, or product-building. If a district has no relevant OPEN item after checking its official pages, record that the district was checked rather than silently skipping it.

Adjacent Seoul district sites may be explored when broad discovery surfaces a relevant opportunity, but 노원·도봉·강북 remain the mandatory local baseline.

For AI news:
- Search broadly across the web, GitHub releases/repos, Hugging Face, arXiv/research labs, official product updates, and developer communities.
- Do not limit discovery to major AI vendors.

Discovery/community sources are for finding leads. Final published facts should be verified against primary official sources whenever available.


## Daily research checklist

This checklist is a completion gate, not a suggestion. A daily refresh is incomplete until every applicable step below is performed or explicitly exhausted.

### 1. Re-verify existing OPEN and UPCOMING opportunities first
- Re-open every currently OPEN or UPCOMING contest/support item's primary official source.
- For `OPEN`, confirm registration is still open, deadline/date/time, eligibility, prize/support details, and official links.
- For `UPCOMING`, confirm the announced opening date/time, whether capacity is first-come or limited, deadline, eligibility, rewards, and official application/login prerequisites. Promote it to `OPEN` once the opening time arrives and the official application path is live.
- If an official source proves registration ended, keep the item but set `status: CLOSED`.
- Do not close or delete an item merely because today's search does not surface it.

### 2. Run broad unrestricted web discovery before fixed-source checks
Search the open web first so discovery is not limited to known platforms. Run independent query groups for:
- AI / LLM / data competitions and hackathons, including announced-but-not-yet-open registration, countdown pages, first-come applications, and recurring branded competitions
- general software-development contests and hackathons
- app / web / mobile / backend / API / cloud / DevOps
- security / cybersecurity
- fintech / finance / payment / insurance development
- public-data / GovTech / civic-tech
- public-sector / 국민참여 / 아이디어 / 서비스기획 / 산업특화 공모전
- startup / product-building hackathons
- startup / pre-startup / commercialization / PoC / accelerator / incubation / workspace support
- cloud / GPU / API / SaaS / AI development credits

Use multiple Korean and English query variants and inspect unfamiliar domains returned by search. Finding enough results in one group never satisfies another group.

### 3. Check fixed sources as a second safety net
After broad search, separately inspect the known source families instead of treating them as the whole universe. For structured listing sites, enumerate the current listing rather than sampling one or two results:
- DACON special gate: enumerate every live card under the homepage's `데이커: 진행 중인 해커톤` and `진행 중인 경진대회` sections and record the complete inventory/disposition evidence.

- DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea
- 소통24 공모전, 대한민국 정책브리핑, 중앙부처·공공기관·지자체 공식 공모/보도자료
- AI_TOP_100 (`aitop100.org`), Kakao Impact and Brian Impact competition/program announcements
- EventUs, Luma, 온오프믹스, Devpost, Meetup
- K-Startup, 기업마당, SBA and Seoul startup programs
- NIPA, KISA and other ICT/public agencies
- fintech/financial-industry startup and developer programs
- organizer/developer pages of companies, universities, foundations, associations and public institutions

- Mandatory local pass: 노원구청/노원청년포털, 도봉구청/청년정책·청년창업센터, 강북구청/일자리청년과·청년일자리센터. Each must be checked independently for current 모집/접수중 items.

### 4. Expand from newly discovered organizers
For every credible new organizer/domain discovered through search:
- inspect its current announcements/events/program pages
- check whether there are sibling opportunities not visible in the original search result
- preserve useful new source domains as discovery knowledge, but never turn the source list into a whitelist

### 5. Verify each publishable candidate against primary sources
Do not publish from an aggregator summary alone when a primary source exists.
Confirm using one or more of:
- official organizer announcement
- official application page
- official notice/PDF
- official FAQ/rules page

For each opportunity, verify and record:
- organizer / host
- exact application period and deadline time
- individual / one-person team / team-size rules
- no-business-registration pre-startup eligibility
- employee / side-job / exclusivity / public-servant or teacher restrictions
- current and post-selection business-registration requirements
- region/nationality/age/school/company restrictions
- what must actually be submitted or built
- evaluation method
- total prize/support amount and tiered rewards
- non-cash benefits
- cloud/GPU/API/SaaS/AI credits and whether OpenAI/Azure OpenAI is explicitly covered
- official application, notice and FAQ links

When a fact is not stated, record `명시 없음`, `공개 정보 없음`, or `확인 필요`; never infer permission or eligibility.

### 6. Apply realistic-user eligibility only after verification
- Keep opportunities realistically accessible to an individual / one-person team or no-registration pre-startup applicant.
- Prefer nationwide/online/Seoul/capital-region-accessible programs.
- Exclude existing-company-only and clearly non-capital-region-only programs when the user cannot apply.
- Do not treat `대한민국 국민 누구나` as proof that employment has no restrictions; if no restriction is found, say `재직자 제한 명시 없음`.

### 7. Deduplicate and classify
- Merge the same underlying opportunity across aggregator pages and official pages into one stable item.
- Distinguish a new opportunity from an update to an existing one.
- Classify contests into the stable categories: `AI · 데이터`, `소프트웨어 개발`, `앱 · 웹 서비스`, `보안`, `핀테크`, `공공데이터`, `스타트업 · 프로덕트`.
- Put startup grants/incubation/accelerators/PoC/credits in `support`, not `contests`.

### 8. Mandatory omission checks before finishing
Do not finish the opportunity refresh until all applicable gates pass:
- If `support` has zero OPEN items, rerun startup/support discovery with new query variants and re-check K-Startup, 기업마당, SBA, NIPA/KISA and fintech/startup sources.
- If OPEN contests are mostly AI/data, rerun the non-AI software-development track.
- If there are no OPEN general-software/app/web/security/fintech/public-data opportunities, run another broad search across those categories before concluding none were found.
- If there are no OPEN individual-accessible public/idea/industry-specialized contests with meaningful prize/portfolio/product value, rerun `아이디어 공모전` / `국민참여 공모` / `서비스 기획 공모전` / `산업 아이디어 공모전` searches and re-check 소통24 plus government/public-agency official sources.
- Search separately for imminent application openings (`접수 예정`, `신청 시작`, `오픈 예정`, `선착순`, countdown pages) in the next 7 days. Any relevant same-day/next-24-hour or limited-capacity opening must not be omitted merely because registration is not open yet; publish it as `UPCOMING` with `openingAt`.
- If a major source family could not be checked because of a tool/site failure, preserve existing verified data and record the gap rather than silently treating it as empty.
- Do not satisfy a raw-candidate quota by counting obvious duplicates; candidate counts refer to materially distinct opportunities.

### Multi-deadline display rule
- Never combine different deadline states into one `dDay` string such as `오늘 마감 / D-15`.
- For opportunities with multiple tracks/topics/deadlines, `dDay` must represent only the nearest currently actionable deadline and include its scope when needed, e.g. `주제1·2 오늘 마감`.
- Keep all track/topic deadlines in `deadlineText` and `period`.
- After the nearest deadline passes, advance `dDay` to the next still-open deadline instead of leaving a stale mixed status.
- Keep the overall opportunity `OPEN` while at least one eligible track/topic is still accepting submissions.

### 9. Final consistency check
Before writing data:
- confirm every new item has a primary official link when available
- confirm no expired opportunity remains OPEN solely because of stale data
- confirm no `UPCOMING` item whose opening time has passed remains UPCOMING without re-checking the official application page
- confirm `firstSeenDate` was not reset
- confirm routine re-checks changed only `lastVerifiedDate`
- confirm meaningful changes advanced `lastUpdatedDate`
- confirm current `categoryLabel`/tags reflect the actual opportunity type

### 10. Save, validate and verify deployment
- Write one final snapshot to both `data/latest.json` and today's `data/archive/YYYY-MM-DD.json`.
- Write the actual current-run research evidence to `data/research/YYYY-MM-DD.json`.
- Run `scripts/validate_data.py` against the final snapshot before publishing it.
- The promotion workflow will run `scripts/validate_research_audit.py` against the current `main` baseline. Do not claim completion unless that evidence gate passes.
- Scheduled automation MUST NOT write directly to `main`. Publish only `data/latest.json`, `data/archive/YYYY-MM-DD.json`, and `data/research/YYYY-MM-DD.json` to a staging branch named `automation/daily-brief-YYYY-MM-DD-data`, based on the current `main`.
- The staging branch must contain no UI or unrelated changes.
- Prefer one staging commit containing all three files so the branch represents one complete snapshot plus its research evidence.
- `.github/workflows/promote-daily-brief.yml` re-validates the snapshot and research evidence, confirms the archive is byte-for-byte identical to `data/latest.json`, enforces the allowed-file set, promotes the result to `main` with commit message `Update daily brief for YYYY-MM-DD`, dispatches `.github/workflows/pages.yml`, and waits for its result.
- The refresh is complete only after the research evidence gate, promotion workflow, and dispatched Pages workflow all succeed. A staging commit alone is not success.
- Normal successful refreshes stay silent; report only failures that require user attention.


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
- The scheduled automation writes the completed snapshot plus `data/research/YYYY-MM-DD.json` only to `automation/daily-brief-YYYY-MM-DD-data`; it does not update `main` directly.
- `.github/workflows/promote-daily-brief.yml` is the promotion path from the automation staging branch to `main`. It validates the candidate, validates research coverage evidence against the current `main` baseline, enforces the allowed-file set, creates the required `Update daily brief for YYYY-MM-DD` commit on `main`, dispatches `.github/workflows/pages.yml`, and waits for that workflow to succeed.
- A staging commit or a successful `main` push is not the same as a successful site refresh. Verify the promotion run and the Pages validate/deploy run for the promoted commit.
- If promotion cannot push to `main`, validation fails, the archive differs from `latest`, or Pages fails, treat the refresh as failed and report the concrete error.
- Do not send Slack messages for normal refreshes. Report only failures needing user attention.
