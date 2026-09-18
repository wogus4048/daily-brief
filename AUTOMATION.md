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
