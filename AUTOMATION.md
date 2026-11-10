# daily-brief automation contract

The single active `daily-brief 매일 갱신` automation owns the full refresh. It updates data only unless the user explicitly asks for UI changes.

The run order, per-step completion criteria and the only valid stop conditions are in `docs/daily-runbook.md`. Read that file in full first, then read each section of this contract that a runbook step references when starting that step.

## Data model

The service covers only two categories since 2026-11-10 (user decision: "공모전 · 해커톤, 창업 · 지원사업 이 카테고리만 집중"). AI news and AI Discovery were removed; old snapshots may still carry `aiNews`/`aiDiscovery`, which nothing reads.

The main file is `data/latest.json` with:
- `date`
- `generatedAt`
- `contests` (공모전 · 해커톤)
- `support` (창업 · 지원사업)
- `archive`

All content arrays are cumulative catalogs, not replace-every-day feeds.

## Editorial selection: what belongs in each category

Select information for the decision it helps the reader make:
- `contests`: collect all discoverable idea/proposal competitions and all competitions/hackathons involving program/software development, regardless of industry, AI relevance, prize size, or perceived portfolio value. Include app, web, game, automation, data/software and prototype-building events. Naming/slogan/표어/character contests, literary contests (백일장, 신춘문예, 수기, 글쓰기), video/photo/film contests and art/design/webtoon contests are out of scope (user decision, 2026-10-13). Record eligibility, team requirements, region, submissions, dates and rewards; these are visible conditions, not implicit personal-fit exclusion filters. Do not claim exhaustive coverage of the entire web; record the sources searched and gaps.
- `support`: collect all discoverable startup/pre-startup application opportunities except programs explicitly restricted to applicants who already have business registration at application time. Include recruitment/application programs such as 모두의창업, founder selection, pre-startup education, incubation, mentoring, commercialization, funding, workspace and developer credits, including programs without cash grants. Mixed pre-startup/existing-business programs qualify through the pre-startup track. Record regional, age, employment and other requirements rather than silently excluding on those grounds. Distinguish registration required at application from registration required after selection; the latter is not an exclusion. Mark unclear registration eligibility as requiring confirmation instead of guessing. Generic non-startup events remain outside this category.

Meaningful updates include changed eligibility, opening/deadline, submission rules, prize/support, application availability, actual release/access, material pricing/license changes, reproducible new capabilities, corrections, or consequential changes in an ongoing story. A routine re-check, increased likes/stars, another repost, or unchanged marketing copy is not an update. Preserve `firstSeenDate`; use `lastUpdatedDate` only for substantive changes.


## Research evidence gate

Every scheduled refresh must also write `data/research/YYYY-MM-DD.json`. This is not optional logging; it is promotion evidence.

The audit must record:
- `date`, `completedAt`
- optional `status`; when present it must be `COMPLETE`. Drafting markers such as `DRAFT_NOT_VALIDATED` block promotion. Reconcile narrative fields such as `researchLimitations` with the final evidence before validation.
- `sourceDiscoveries`: an array (possibly empty) of credible recurring/list-source discoveries considered during the current run
- `reverifiedIds`: every previously OPEN/UPCOMING contest/support id actually re-opened and checked
- `publishedIds`: every newly published contest/support/AI-news id for the snapshot date
- independent track evidence for `aiData`, `generalSoftware`, `publicIdea`, `startupSupport`, and `upcomingOpenings`
- for each track, the actual queries grouped by required search axis (from 2026-10-14: at least two distinct queries per axis, and Korean plus non-Korean variants in every track except Korea-only `publicIdea`), raw candidate titles/URLs, and disposition (`PUBLISHED`, `EXISTING`, `DUPLICATE`, `INELIGIBLE`, `CLOSED`, `NOT_RELEVANT`)
- fixed-source evidence for every mandatory source family, including checked URLs or a concrete failure reason
- district evidence for 노원, 도봉, 강북, including checked URLs or a concrete failure reason

The audit is validated by `scripts/validate_research_audit.py`. A refresh is incomplete if the audit is missing, if a required search axis has no executed query evidence, if required source/district evidence is missing, if the raw-candidate minimum was neither met nor explicitly exhausted with a reason, or if an OPEN/UPCOMING item that is due under the risk-based verification cadence was not re-verified.

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

## Source crawler preflight

The scheduled ChatGPT automation remains the orchestrator, but crawler execution is pre-warmed so the 09:00 reasoning run does not waste most of its runtime waiting on Chromium.

Trigger protocol:
- `.github/workflows/crawl-sources.yml` is scheduled at 00:17, 02:17, 04:17 and 06:17 Asia/Seoul (15:17, 17:17, 19:17 and 21:17 UTC on the preceding day). Scheduled starts are not punctual: observed delays were 2h44m-5h48m, so the first attempt starts right after the Seoul date changes. Later scheduled attempts reuse a verified same-day cache instead of replacing evidence the editorial run may already be using.
- At the start of the ChatGPT refresh, first check whether today's `data/source-cache/YYYY-MM-DD.json` already exists on current `main`, was generated by `playwright-chromium`, and contains successful required sources. If yes, use it immediately and do not re-trigger the crawler.
- If today's cache is missing, stale, or required sources failed, first inspect queued/running crawler runs. If one is running, wait for it instead of starting duplicates.
- If no crawl is running and the available tool supports Actions dispatch, dispatch `crawl-sources.yml` against `main` (`gh workflow run crawl-sources.yml --ref main` or the equivalent authorized workflow-dispatch API).
- Do not force-update/reset a trigger branch or use repository writes to bypass a tool's safety rejection. If Actions dispatch is unavailable, report that the user can select **Run workflow** on the source-inventory workflow, then retry after the cache is ready.
- A blocked run is not permission to pause or delete the ChatGPT schedule. Preserve its enabled state unless the user explicitly requests otherwise; report the concrete blocker and retry on the next scheduled run.
- The crawler checks out current `main`, runs Playwright Chromium against its active source manifest, and writes:
  - `data/source-cache/latest.json`
  - `data/source-cache/YYYY-MM-DD.json`
- The crawler commits those cache files back to `main` as `Refresh source cache for YYYY-MM-DD`.

While the crawler runs, broad unrestricted discovery may proceed in parallel. Before completing the DACON/DAKER fixed-source pass or creating the daily staging branch:
- re-read `data/source-cache/YYYY-MM-DD.json` from `main`
- require `date == YYYY-MM-DD` for the current Asia/Seoul day
- require `crawler.engine == playwright-chromium`
- require non-empty raw inventories and require the crawler to expose `actionableItems`/`actionableCount` for both sources
- if the current-day cache has not appeared yet, poll/retry for up to 10 minutes; if it still does not appear, treat source crawling as failed and do not claim a successful daily refresh
- create `automation/daily-brief-YYYY-MM-DD-data` only after the current-day source-cache commit is present on `main`, so the staging branch contains the exact cache used by the research audit

Do not fabricate or reconstruct source-cache contents manually. The cache is machine-generated evidence from the Playwright workflow.

Crawler source inventory is maintained in `data/crawler-sources.json`. Active machine-crawled sources currently include 위비티, DACON competitions, DAKER hackathons, Hackathon Korea, 소통24 공모전, Grantly 지원사업, Devpost open hackathons, ContestKorea, and K-Startup highlights. When an active crawler source succeeds, every `actionableItems[]` URL must be reviewed and recorded in `data/research/YYYY-MM-DD.json -> machineSources.<sourceKey>[]` with `title`, `url`, and `disposition`. DACON/DAKER keep their stricter dedicated inventories as well. Failed non-required crawlers must be recorded as source gaps and fall back to GPT/web inspection rather than being silently treated as empty.

Review `data/crawler-sources.json -> nextCandidates` continuously as part of the daily loop.

### Crawler source self-improvement loop
- Every daily research audit MUST contain `sourceDiscoveries: []`.
- When broad search or a fixed-source pass reveals a recurring/list-style domain that could reduce future omission risk, add a discovery entry with `key` when known, `name`, `domain`, `listUrl` or `url`, `reason`, `relevantUrls`, `publishedIds`, and optional `crawlerSpec`.
- A `crawlerSpec` may be proposed only for a public, read-only listing page. Do not create crawler specs that require login, user data, destructive actions, or bypassing access controls.
- Generic `crawlerSpec` fields may include `url`, `linkSelector`, `hostSuffix`, `urlContains`, `urlRegex`, `excludeUrlRegex`, `expand`, `scrollRounds`, `waitMs`, `actionability` (`all` or `hints`), and `pagination` (`urls`, `param`, `maxPages`, optional `closedRunLimit` and `keepParams`). A paginated source keeps only open rows, ignores `expand`, `scrollRounds` and `actionability`, and records `coverage` for each listing in the source cache: `stoppedBy` is `empty`, `repeated`, `closedRun`, `blank`, `error` or `maxPages`, and `reachedEnd: false` means the listing was not read to its end, and the source health summary warns about it. A blank page after the first is read twice before it counts as the end. `lastOpenPage` and `longestClosedRun` show how close `closedRunLimit` came to cutting off open rows. `keepParams` lists the query keys that identify an item, so one contest stays one item across pages and categories.
- When reading collected news leads, follow `discussionUrl` and `primaryUrl` when present. For repository/model/app leads, verify the original item. Hot/trending listing placement is evidence of that listing at `observedAt`, not proof of launch date, universal popularity or a daily growth rate. Keep blocked sources as reported gaps; do not bypass access controls.
- Even if GPT does not explicitly nominate a source, `scripts/evolve_crawler_sources.py` automatically inspects relevant/published raw-candidate domains and registers recurring/high-yield domains as `NEEDS_SPEC` candidates.
- Candidate lifecycle is `NEEDS_SPEC -> SHADOW -> ACTIVE`. A candidate with a crawler spec runs in shadow without affecting required coverage until it proves stable.
- Auto-promotion requires the policy thresholds in `data/crawler-sources.json`: repeated discovery, actual published yield, consecutive successful shadow crawls, and minimum score.
- Non-required ACTIVE crawlers that repeatedly fail are automatically moved to `degraded`; degraded crawlers are shadow-tested for recovery. Required crawlers are never silently auto-demoted.
- `.github/workflows/evolve-crawler-sources.yml` runs after a daily research file reaches `main`, updates `data/crawler-source-state.json`, scores every source, performs eligible promotion/degradation/recovery, and commits the evolved manifest.
- The source lifecycle is evidence-driven. Do not promote a site simply because it exists; require measurable discovery value and crawler stability. Do not keep a repeatedly broken non-required crawler active merely because it was once useful.
- Source lifecycle evaluation counts each research date once. Re-dispatching the same day's evolution must not inflate success streaks, sightings or publication yield.
- `data/crawler-source-state.json` is the cumulative operational history: success/failure streaks, discovery sightings, relevant/published yield, shadow stability, and score.

Review `data/crawler-sources.json -> nextCandidates` periodically. Promote a candidate to the active crawler set when it has a stable public listing/pagination/filter path and machine enumeration materially reduces omission risk.

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
- Include government ministries, public agencies, public corporations, sports/culture/transport/finance/identity and other industry-specific organizers. Collect idea/proposal competitions across all subjects, including those unrelated to software, except the naming/slogan, literary, video/photo and art contests excluded above.
- Include idea/proposal contests regardless of cash prizes or perceived portfolio value. A finished code submission is not mandatory. Independently collect all program/software-development competitions.
- Record individual/team, student, employment and regional conditions without narrowing collection to an assumed user profile; record whether PoC/prototype/demo is optional or mandatory.
- Gather at least 10 materially distinct raw candidates or exhaust the relevant government/public and industry-specific source axes.

### Structured source enumeration

For source sites that expose a finite "ongoing/current/open" listing, do not treat opening the site or finding one result as a completed source check. Enumerate the listing and disposition every visible current item before marking the source checked.

DACON/DAKER are mandatory and stricter:
- Open both listing pages directly: `https://www.dacon.io/competitions` and `https://daker.ai/public/hackathons`. Search-engine results or the DACON homepage alone are not sufficient.
- On DACON competitions, enumerate every currently visible competition card and keep loading/advancing the listing when the page exposes more results. Prioritize cards marked 참가신청중/진행중/접수중, but still disposition visible closed/practice items so the source review is auditable.
- On DAKER hackathons, enumerate every listed hackathon card. The page mixes current and ended events, so open each relevant detail page and verify its actual schedule/status before deciding.
- Follow every potentially relevant item to its detail/official page and determine whether it is `PUBLISHED`, `EXISTING`, `DUPLICATE`, `INELIGIBLE`, `CLOSED`, or `NOT_RELEVANT`.
- The Playwright cache preserves the full raw listing in `items[]`, but the mandatory human/model review set is `actionableItems[]`: entries whose live card status indicates 참가신청중/접수중/진행중/모집중/예정.
- Record every `sources.daconCompetitions.actionableItems[]` entry in `data/research/YYYY-MM-DD.json -> fixedSources.DACON.competitionsInventory[]`, and every `sources.dakerHackathons.actionableItems[]` entry in `fixedSources.DACON.dakerInventory[]`, each with at least `title`, `url`, and `disposition`.
- Do not spend the daily review budget re-opening clearly historical/연습/종료 cards from the raw `items[]` unless another search track surfaces them as relevant again.
- Record both exact listing URLs in `fixedSources.DACON.urls`.
- A DACON source check is incomplete if even one actionable URL from the machine-generated current-day source cache is absent from the matching research inventory. `scripts/validate_research_audit.py` compares the audit against that Playwright actionable cache during promotion and blocks incomplete coverage.
- DACON/DAKER items must still pass the same user-eligibility and primary-source verification rules before publication.

For all opportunity tracks:
- Start with unrestricted web search and inspect new domains.
- Also check DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea, K-Startup, 기업마당, Luma/EventUs/온오프믹스/Meetup and official organizer pages.
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

Apply the same broad contest/startup scope to district sources: include idea/software competitions and startup recruitment/support admitting applicants without existing business registration. Record local, age and other conditions visibly instead of excluding for an assumed user profile. Generic festivals, leisure classes, unrelated welfare notices and generic exam-fee reimbursements remain outside the contest/startup scope. If a district has no relevant OPEN item after checking its official pages, record the check rather than silently skipping it.

Adjacent Seoul district sites may be explored when broad discovery surfaces a relevant opportunity, but 노원·도봉·강북 remain the mandatory local baseline.

Discovery/community sources are for finding leads. Final published facts should be verified against primary official sources whenever available.


## Daily research checklist

This checklist is a completion gate, not a suggestion. A daily refresh is incomplete until every applicable step below is performed or explicitly exhausted.

### 1. Re-verify existing OPEN and UPCOMING opportunities by risk cadence
Do not spend every daily run reopening every long-lived unchanged item. Re-verify items that are due under this deterministic cadence, plus any item whose crawler/search evidence materially changed:
- When a repository shell is available, run python3 scripts/research_worklist.py --date YYYY-MM-DD --json after confirming the current-day source cache. This read-only worklist enumerates pending official rechecks, actionable URLs and crawler gaps, but is NOT evidence of any actual page visit. Never copy its pending items into the audit as if checked.
- If a shell is unavailable, derive the same pending worklist from current main and the cache; do not omit a track or treat machine-discovered URLs as verified.
- `OPEN` with nearest actionable deadline within 3 days: every day.
- `OPEN` with nearest actionable deadline 4–14 days away: at least every 2 days.
- `OPEN` with deadline more than 14 days away or no parseable deadline: at least every 7 days.
- `UPCOMING` whose opening is today/tomorrow: every day; other UPCOMING items: at least every 2 days.
- Any source-cache/search evidence indicating a status/schedule change forces immediate re-verification regardless of cadence.
- For each due item, open its primary official source and confirm registration status, deadline/date/time, eligibility, prize/support details and official links. Set `lastVerifiedDate` to the snapshot date.
- For `UPCOMING`, also confirm opening time, capacity/first-come rules and application prerequisites; promote it to `OPEN` once live.
- If an official source proves registration ended, keep the item but set `status: CLOSED`.
- Do not close/delete an item merely because today's search does not surface it.
- `scripts/validate_research_audit.py` independently computes the due set from the main baseline and blocks promotion if any due id is absent from `reverifiedIds` or its resulting `lastVerifiedDate` is stale.

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
- DACON special gate: directly enumerate `https://www.dacon.io/competitions` and `https://daker.ai/public/hackathons`; record separate complete inventory/disposition evidence for both pages and continue through any exposed "더보기"/additional listing results rather than sampling only the first screen.

- DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea
- 소통24 공모전, 대한민국 정책브리핑, 중앙부처·공공기관·지자체 공식 공모/보도자료
- AI_TOP_100 (`aitop100.org`), Kakao Impact and Brian Impact competition/program announcements
- EventUs, Luma, 온오프믹스, Meetup
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

### 6. Record eligibility without silently narrowing collection
- Keep idea/proposal and program/software-development contests across subjects, prize levels, regions and team requirements. Show the verified conditions.
- For startup support, exclude only programs explicitly requiring an already registered business at application time. Keep pre-startup tracks, mixed programs admitting unregistered applicants, and programs requiring registration only after selection.
- Keep startup application/recruitment programs such as 모두의창업 even without a cash grant. Record age, region, employment, prior-business and post-selection obligations; unclear eligibility is labelled `확인 필요`, not silently excluded or presented as confirmed eligibility.
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
- If there are no OPEN public/idea/industry-specialized contests, rerun `아이디어 공모전` / `국민참여 공모` / `서비스 기획 공모전` / `산업 아이디어 공모전` searches and re-check 소통24 plus government/public-agency official sources, without applying a minimum prize or personal-fit filter.
- Search separately for imminent application openings (`접수 예정`, `신청 시작`, `오픈 예정`, `선착순`, countdown pages) in the next 7 days. Any relevant same-day/next-24-hour or limited-capacity opening must not be omitted merely because registration is not open yet; publish it as `UPCOMING` with `openingAt`.
- If a major source family could not be checked because of a tool/site failure, preserve existing verified data and record the gap rather than silently treating it as empty.
- Do not satisfy a raw-candidate quota by counting obvious duplicates; candidate counts refer to materially distinct opportunities.

### Deadline field `deadline` (required on OPEN items from 2026-11-10)
- Whoever reads the official page writes the application deadline as data in `deadline`. The code never reads a deadline out of `deadlineText`; that text is for people. Decisions: `docs/archive/review-2026-11-06-dday.md`, `docs/archive/review-2026-11-09-dday-implementation.md`.
- Allowed values (`research_rules.deadline_info`, checked by `validate_data.py`):
  - A list of `YYYY-MM-DD` dates, always with the year: the dates by which a newcomer must apply. Several tracks give several dates; the item stays `OPEN` until the last one passes and D-day shows the next one.
  - When newcomers must register before a later submission date, list only the registration date. That date closes the item.
  - Do not list event, judging, announcement or submission-only dates.
  - `"상시"`, `"수시"`, `"예산 소진 시"` or `"선착순"` for calls without a fixed deadline. Use one only when the official page gives no closing date. A date from a portal beside it does not count. First-come calls with a stated closing date take that date.
  - `"확인 필요"` when the official page does not state the deadline. Such an item is kept but not shown until the deadline is confirmed.
- Do not write `dDay` or `autoClosedDate`. `daily_run.py publish` writes `dDay` from `deadline` and closes OPEN items whose dates all passed (`research_rules.apply_deadlines`). The site counts D-day from `deadline` on the reader's day.
- An item closed by date carries `autoClosedDate`. If an official page later shows an extension, set it `OPEN` with the new `deadline`.
- Changing `deadline` is a material change and needs official re-verification like `deadlineText`.

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
- Scheduled automation MUST NOT write the daily result directly to `main`. The source crawler is the only exception: its workflow may commit `data/source-cache/**` to `main`. After that current-day cache commit is visible, create the daily staging branch from the latest `main` and publish only `data/latest.json`, `data/archive/YYYY-MM-DD.json`, and `data/research/YYYY-MM-DD.json` to `automation/daily-brief-YYYY-MM-DD-data`.
- The staging branch must contain no UI or unrelated changes.
- The staging branch MUST contain all three files in one completed staging commit. Do not split latest/archive/research into separate commits or claim remote persistence from a local commit SHA.
- After the three files pass `validate_data.py` and `validate_research_audit.py` against the current main baseline, create a portable, checksummed handoff with `scripts/publication_bundle.py pack` and preserve a second copy in a confirmed persistent store before attempting the staging push. Its input files must be the exact validated editorial snapshot, dated archive, and research audit. `pack` must fail if the audit, dates, or byte identity fail. A bundle in temporary task storage alone is not durable recovery.
- On a failed staging push, distinguish a transient network failure from a host/tool security denial. Do not replace a denied write with another branch/repo/API/workflow-write path or retry it blindly. Report the exact blocked operation and the confirmed location of the recovery bundle. After the normal write path is authorized again, unpack and revalidate the same saved evidence against the then-current main baseline before creating the single staging commit. If the baseline has changed and audit fails, reconcile the evidence honestly; never force-push or alter prior archives merely to pass.
- `.github/workflows/promote-daily-brief.yml` re-validates the snapshot and research evidence, confirms the archive is byte-for-byte identical to `data/latest.json`, enforces the allowed-file set, promotes the result to `main` with commit message `Update daily brief for YYYY-MM-DD`, dispatches `.github/workflows/pages.yml`, and waits for its result.
- The refresh is complete only after the research evidence gate, promotion workflow, dispatched Pages workflow, and current-day public snapshot checks all succeed. A staging commit or a green Pages run for an old snapshot is not success.
- Normal successful refreshes stay silent; report only failures that require user attention.


## Eligibility

Collect broadly within the user's explicit scope: all idea/proposal and software-development contests, and all startup application/support programs except those requiring existing business registration at application.
- Show individual/team, age/student, region, employment and full-time/exclusivity conditions as verified facts; do not silently exclude for assumed personal fit.
- For startup/support programs, verify registration requirements separately for application and post-selection. Include eligible pre-startup tracks of mixed programs and clearly label track-specific requirements.
- Record past business-history restrictions and employee/side-job restrictions; do not assume these requirements are satisfied.
- record whether cash support can officially be used for development, SaaS, cloud, GPU, API or AI expenses; when not stated, mark it as requiring confirmation

Exclude startup/support programs only when existing business registration is explicitly mandatory for all relevant application tracks. If registration eligibility remains unclear, preserve the candidate with `확인 필요` and the official source; never claim confirmed eligibility. Registration after selection does not disqualify a program.

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
