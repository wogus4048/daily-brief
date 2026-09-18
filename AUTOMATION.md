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

For contests/support:
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
