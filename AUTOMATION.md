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


## Daily research checklist

This checklist is a completion gate, not a suggestion. A daily refresh is incomplete until every applicable step below is performed or explicitly exhausted.

### 1. Re-verify existing OPEN opportunities first
- Re-open every currently OPEN contest/support item's primary official source.
- Confirm registration is still open, deadline/date/time, eligibility, prize/support details, and official links.
- If an official source proves registration ended, keep the item but set `status: CLOSED`.
- Do not close or delete an item merely because today's search does not surface it.

### 2. Run broad unrestricted web discovery before fixed-source checks
Search the open web first so discovery is not limited to known platforms. Run independent query groups for:
- AI / LLM / data competitions and hackathons
- general software-development contests and hackathons
- app / web / mobile / backend / API / cloud / DevOps
- security / cybersecurity
- fintech / finance / payment / insurance development
- public-data / GovTech / civic-tech
- startup / product-building hackathons
- startup / pre-startup / commercialization / PoC / accelerator / incubation / workspace support
- cloud / GPU / API / SaaS / AI development credits

Use multiple Korean and English query variants and inspect unfamiliar domains returned by search. Finding enough results in one group never satisfies another group.

### 3. Check fixed sources as a second safety net
After broad search, separately inspect the known source families instead of treating them as the whole universe:
- DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea
- EventUs, Luma, 온오프믹스, Devpost, Meetup
- K-Startup, 기업마당, SBA and Seoul startup programs
- NIPA, KISA and other ICT/public agencies
- fintech/financial-industry startup and developer programs
- organizer/developer pages of companies, universities, foundations, associations and public institutions

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
- If a major source family could not be checked because of a tool/site failure, preserve existing verified data and record the gap rather than silently treating it as empty.
- Do not satisfy a raw-candidate quota by counting obvious duplicates; candidate counts refer to materially distinct opportunities.

### 9. Final consistency check
Before writing data:
- confirm every new item has a primary official link when available
- confirm no expired opportunity remains OPEN solely because of stale data
- confirm `firstSeenDate` was not reset
- confirm routine re-checks changed only `lastVerifiedDate`
- confirm meaningful changes advanced `lastUpdatedDate`
- confirm current `categoryLabel`/tags reflect the actual opportunity type

### 10. Save, validate and verify deployment
- Write one final snapshot to both `data/latest.json` and today's `data/archive/YYYY-MM-DD.json`.
- Run `scripts/validate_data.py`.
- Commit to `main` using `Update daily brief for YYYY-MM-DD`.
- Verify GitHub Actions validation and Pages deployment, not just commit success.
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
- Commit the completed snapshot to `main`.
- Every push triggers `.github/workflows/pages.yml`.
- A successful commit is not the same as a successful site refresh; verify both validate and deploy jobs when possible.
- Do not send Slack messages for normal refreshes. Report only failures needing user attention.
