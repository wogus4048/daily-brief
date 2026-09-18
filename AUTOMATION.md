# daily-brief automation contract

The single active `daily-brief 매일 갱신` automation owns the full daily data refresh. Automations update data only; UI files remain stable unless the user deliberately requests a design change.

## Main data file
- `data/latest.json`
- Required top-level fields: `date`, `generatedAt`, `contests`, `aiNews`, `support`, `archive`
- The daily automation owns all three content arrays: `contests`, `aiNews`, and `support`.
- Build one complete snapshot and write it atomically after research and validation. Do not run independent section writers that can race or overwrite one another.

## Research and discovery
- Fixed source lists are starting points, never a whitelist.
- Begin each run with unrestricted web discovery so new platforms, organizers, labs, companies, communities, event pages, and official sources can be found.
- For contests/support, gather a broad raw candidate pool before applying eligibility filters. Core starting sources include DACON, Hackathon Korea, Grantly, 링커리어, 요즘것들, ContestKorea, K-Startup, 기업마당, Luma/EventUs/온오프믹스/Devpost/Meetup, but research must go beyond them.
- For AI news, discover broadly across web search, official releases, GitHub repositories/releases, Hugging Face, papers/research labs, product launch pages, and developer communities. Do not limit discovery to major AI vendors.
- Discovery/community pages may surface candidates, but final published facts should be rechecked against primary official sources whenever available.

## Opportunity eligibility
- Publish opportunities the user can realistically enter: individual, one-person team, or eligible pre-startup applicant without a required existing business registration.
- Exclude existing-company-only programs, explicit employee bans/full-time exclusivity, and non-capital regional-only programs that require local residence/company presence.
- Prefer nationwide, online, Seoul, or capital-region-accessible opportunities.
- If eligibility remains ambiguous after checking the official notice/FAQ, do not publish it.
- It is valid for `support` to be empty.

## Quality rules
- Prefer official primary sources.
- Never invent eligibility, rewards, deadlines, dates, or URLs.
- Distinguish registration deadline from event/submission end date.
- Remove expired or registration-closed opportunities from `latest.json`, while preserving historical archive files.
- Recalculate D-day labels against Asia/Seoul date.
- Avoid duplicate opportunities/news IDs and duplicate stories.
- AI news should favor fresh, meaningful, usable releases rather than recycled articles, rumors, or weak promotional coverage.

## Archive
- Save the full merged daily snapshot to `data/archive/YYYY-MM-DD.json`.
- The current day's archive must match the final `data/latest.json` snapshot after the run.
- `archive` contains available archive dates, newest first.
- Do not rewrite or delete older archive files.

## Validation and deployment
- Validate JSON shape and required fields with `scripts/validate_data.py` before finalizing.
- Commit the completed snapshot to `main` using `Update daily brief for YYYY-MM-DD` or another clear daily-refresh message.
- Every push to `main` triggers `.github/workflows/pages.yml`, which validates and redeploys GitHub Pages.
- Do not send Slack messages for normal refreshes. Report only refresh/deployment failures when user attention is required.


## Continuity and safety
- Preserve a stable `id` for the same opportunity/news item across days.
- Every item may carry `firstSeenDate` (`YYYY-MM-DD`). Set it only when the item is first added; never reset it on later days.
- Existing valid opportunities/support items must survive a day where discovery/search misses them. Re-verify them against the official source and remove only when registration is closed, the deadline has passed, or eligibility no longer matches.
- If broad web research partially fails, official pages are unavailable, or a connector/search step errors, do not replace a healthy existing section with an empty or obviously incomplete section. Preserve previously verified active items, retry what can be retried, and fail safely.
- AI news is allowed to rotate more aggressively because freshness matters, but duplicate stories should retain a stable id when they are genuine continuations of the same release/topic.

## Today counts
- Home section labels such as "오늘 신규 N건" count items whose `firstSeenDate` equals the snapshot `date`.
- Total active items and newly discovered-today items are different concepts; do not derive "오늘 신규" from the whole active array length.

## Deployment verification
- After committing the final snapshot, verify that the GitHub Pages workflow validates and deploys successfully when tool access permits.
- A successful commit alone is not equivalent to a successful site refresh.
- If validation or deployment fails, keep the committed data intact, identify the failing stage, and report the failure rather than claiming the site is updated.
