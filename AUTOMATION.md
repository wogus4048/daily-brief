# daily-brief automation contract

Automations update data only. UI files should remain stable unless a deliberate design change is requested.

## Main data file
- `data/latest.json`
- Required top-level fields: `date`, `generatedAt`, `contests`, `aiNews`, `support`, `archive`

## Archive
- Save the full merged snapshot for the day to `data/archive/YYYY-MM-DD.json`.
- `archive` contains available archive dates, newest first.
- Do not delete older archive files.

## Merge ownership
- Contest/support automation owns only `contests` and `support`.
- AI briefing automation owns only `aiNews`.
- Each automation must fetch the latest JSON first and preserve sections it does not own.
- Both automations may refresh `date`, `generatedAt`, `archive`, and the current day's archive snapshot after merging.

## Quality rules
- Prefer official primary sources.
- Never invent eligibility, rewards, deadlines, or URLs.
- Mark unknown facts explicitly.
- Remove expired opportunities from latest lists but preserve historical archive snapshots.
- Recalculate D-day labels against Asia/Seoul date.
- Validate JSON shape before committing.

## Deployment
Every push to `main` triggers `.github/workflows/pages.yml` and redeploys GitHub Pages.
