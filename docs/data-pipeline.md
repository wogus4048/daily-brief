# Data pipeline operations

The ChatGPT task **daily-brief 매일 갱신** performs editorial research. GitHub Actions collects source inventories, validates/promotes its candidate, and deploys. Collection does not itself produce a researched briefing.

## Health checks

- `crawl-sources.yml` is scheduled for 08:50 Seoul. GitHub scheduled runs may be delayed. Required source failures stop cache promotion; their diagnostics are retained as an Actions artifact. Optional failures preserve usable cache results but the final health step fails the run and lists each source in the Actions summary. The editorial task should read source statuses and record gaps, as required by `AUTOMATION.md`.
- `pipeline-health.yml` checks at 10:37 Seoul and can be dispatched manually. It reports collection date, publication date, and source health independently. A missing current-day publication after 10:00 or any active source failure produces a failed run. GitHub workflow notifications depend on the account's notification settings.
- Devpost HTTP errors/security challenges are source failures, never evidence of an empty inventory. Inspect through the existing editorial fallback; do not bypass access controls or remove previously verified opportunities.

For overdue publication, inspect the ChatGPT task's latest run first. Then check for `automation/daily-brief-YYYY-MM-DD-data`, the research audit, the promotion run, and Pages deployment. If the candidate does not exist, rerunning Pages or the inventory crawler cannot replace the missing research. Do not advance `data/latest.json.date` or fabricate an audit to clear the check.

## Repository metrics

`collect-github-metrics.yml` runs after inventory collection or candidate promotion completes, and supports manual dispatch. It reads repository links from the published discovery catalog, uses the Actions token to collect stars/forks, saves `data/github-metrics.json`, and explicitly dispatches Pages (bot pushes alone do not trigger another push workflow).

Metrics remain separate from editorial snapshots. Each repository has a last successful `fetchedAt`, an attempted `checkedAt`, and `OK`, `STALE`, or `FAILED` status. On failure the collector retains valid previous counts, never inventing zero. Cards show the collection time and indicate failed refreshes or data older than 36 hours. Archived briefings do not show today's counts. Browsers fetch only the hosted JSON, not the GitHub API.

Run locally:

```sh
node scripts/test_pipeline.mjs
node scripts/collect_github_metrics.mjs
node scripts/pipeline_health.mjs
npm test
```

An optional `GITHUB_TOKEN` raises API limits for the collector; never commit it. An expected degraded health result exits with status 1 even when the checker itself functions correctly.
