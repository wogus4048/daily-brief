# Data pipeline operations

The ChatGPT task **daily-brief 매일 갱신** performs editorial research. GitHub Actions collects source inventories, validates/promotes its candidate, and deploys. Collection does not itself produce a researched briefing.

## Health checks

- `crawl-sources.yml` is scheduled for 00:17, 02:17, 04:17 and 06:17 Seoul. GitHub scheduled runs on this repository have started 2h44m-5h48m late, so the first attempt begins right after the Seoul date changes and the rest are fallbacks that reuse a verified same-day cache. Required source failures stop cache promotion; their diagnostics are retained as an Actions artifact. Optional failures preserve usable cache results and are reported as `PARTIAL` with source-level warning annotations, while the crawler job succeeds. The editorial task should read source statuses and record gaps, as required by `AUTOMATION.md`.
- `pipeline-health.yml` checks at 10:37 Seoul and can be dispatched manually. It reports collection date, publication date, and source health independently. For today's publication it also requires latest/archive byte equality and a dated research audit with `completedAt`. A missing or incomplete current-day publication after 10:00 or required source failure produces a failed run. Optional source failures remain in the summary without triggering a failure email. GitHub workflow notifications depend on the account's notification settings.
- Devpost HTTP errors/security challenges are source failures, never evidence of an empty inventory. Inspect through the existing editorial fallback; do not bypass access controls or remove previously verified opportunities.

For overdue publication, inspect the ChatGPT task's latest run first. Then check for `automation/daily-brief-YYYY-MM-DD-data`, the research audit, the promotion run, and Pages deployment. If the candidate does not exist, rerunning Pages or the inventory crawler cannot replace the missing research. Do not advance `data/latest.json.date` or fabricate an audit to clear the check.

If the cache is absent and no crawler run is pending, use Actions **Run workflow** on `crawl-sources.yml` against `main` (or `gh workflow run crawl-sources.yml --ref main`). The former force-reset trigger-branch fallback has been removed. If the ChatGPT integration cannot dispatch Actions, report the limitation rather than trying alternate branch writes. Keep the recurring ChatGPT task enabled after an isolated failure unless the user requests a pause. An already-paused ChatGPT task must be resumed in ChatGPT; changing these workflows does not enable it.

Scheduled attempts reuse matching current-day cache files with valid inventories and successful required sources. This keeps a delayed second attempt from overwriting evidence during editorial research. Optional source failures still appear in the health report. Manual dispatch intentionally refreshes the cache.

## Editorial handoff and recovery

The crawler cannot produce an editorial research audit. ChatGPT's scheduled research task must produce all three checked files; neither a successful crawler nor a green Pages run proves today's publication. The daily task must be enabled separately in ChatGPT; this repository cannot enable it.

From a repository checkout that has the matching dated source cache and the baseline `data/latest.json`, prepare a recovery bundle from the *already validated* three candidate files before attempting the normal staging push:

```sh
python scripts/publication_bundle.py pack --date YYYY-MM-DD \
  --latest /path/to/candidate/latest.json \
  --archive /path/to/candidate/archive.json \
  --research /path/to/candidate/research.json \
  --baseline data/latest.json \
  --out artifacts/publication/YYYY-MM-DD.zip
python scripts/publication_bundle.py inspect --bundle artifacts/publication/YYYY-MM-DD.zip --date YYYY-MM-DD --baseline data/latest.json
```

The bundle has exactly three editorial files and a dated SHA-256 receipt. Both creation and recovery run the same snapshot/research validators as promotion against an explicitly supplied baseline. A temporary repository artifact is **not** durable storage: retain an independently accessible copy (for example in the user's file library) and verify it exists. Local Git commits and `artifacts/` alone can disappear when a hosted ChatGPT session ends.

If the approved staging write is unavailable, report the specific error and stop writing. Never use another branch, repository, API tool, or Actions dispatch to bypass a safety denial. After that same authorized path is available, recover with:

```sh
python scripts/publication_bundle.py unpack --bundle /path/to/verified/YYYY-MM-DD.zip \
  --date YYYY-MM-DD --baseline data/latest.json --into artifacts/recovered-YYYY-MM-DD
```

`unpack` refuses existing destinations and never overwrites the working tree. On the **latest** main, stage only the recovered `data/latest.json`, `data/archive/YYYY-MM-DD.json`, and `data/research/YYYY-MM-DD.json` as one commit to `automation/daily-brief-YYYY-MM-DD-data`. Rerun validators against that latest main baseline. The existing promotion workflow enforces the three-file allowlist, equality and research evidence gate. Verify its promotion, the resulting Pages run and actual public `data/latest.json.date`; if a newer baseline invalidates the audit, reconcile the candidate rather than force-pushing or weakening the gate.

Promotion refuses staging snapshots whose date precedes the currently published `main` date, including during a retry, and rechecks this immediately before main mutation. It dispatches Pages with `expected_date`, which checks that day's snapshot/archive/research evidence in the deployed revision. It watches the exact run ID returned by GitHub's official workflow-dispatch API instead of guessing from run titles, timestamps or a head SHA that unrelated metrics commits can advance. Metrics-only Pages runs have no `expected_date`, so they must never be counted as proof of that day's editorial publication. Pages runs queue rather than cancel an in-progress editorial deployment. If GitHub evicts a still-pending dated run, promotion retries only that cancelled run once. After Pages succeeds, it compares the public site's latest JSON date and SHA-256 with the promoted snapshot, allowing brief CDN propagation; publishing is not marked successful until this matches. After a successful deployment, crawler evolution is triggered as independent best-effort maintenance; its later failure must be inspected in its own Actions run, not reported as a failed editorial publication.

Once a valid staging branch already exists remotely, a failed promotion can be re-dispatched via `promote-daily-brief.yml` with `candidate_ref` after reviewing its failure and checking current baseline. If a promotion already deployed and only downstream crawler evolution failed, verify the published state before retrying instead of generating duplicate daily research. Do not re-run the web research for a recoverable deployment failure.

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

An optional `GITHUB_TOKEN` raises API limits for the collector; never commit it. An overdue publication or required-source failure exits with status 1 even when the checker itself functions correctly. Optional source gaps emit warnings and a `PARTIAL` status.
