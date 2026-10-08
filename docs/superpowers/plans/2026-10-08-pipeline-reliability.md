# Daily Brief pipeline reliability

**Goal:** Surface failed sources and missing publication, and collect GitHub counts independently of visitors.

**Architecture:** Keep editorial snapshots and evidence gates intact. Store repository metrics in a separate collected JSON file; retain last successful values on failure. Report crawl health in Actions and preserve diagnostics before failing. Check publication freshness separately after the expected refresh window.

- [x] Add tested repository metrics collector, cached frontend display, and collection/deployment workflow.
- [x] Preserve source failure diagnostics; identify blocked HTTP responses and report each failed source in Actions.
- [x] Add a tested publication freshness check and workflow, distinguishing collection from publication.
- [ ] Run pipeline and UI checks, review, deploy, and verify hosted metrics.

Evidence: Oct 8 scheduled crawl ran at 11:59 KST rather than 08:50; cache exists, but no Oct 8 candidate branch or promotion. Devpost currently responds HTTP 403 with a Cloudflare challenge. User confirms editorial research runs in ChatGPT scheduled tasks; that scheduler's execution log is unavailable here. Do not fabricate an Oct 8 research audit or change the snapshot date to conceal the gap.

Execution: continue inline under existing user authorization to implement and deploy. Preserve pre-existing local editorial/data changes.

Verification: pipeline fixture tests pass, live authenticated collection succeeded for all four repositories, 135 UI checks plus UX/discovery regressions pass, data and crawler lifecycle validators pass, workflow YAML parses. Health checker exits 1 as expected for the real Oct 8 publication gap and Devpost failure. Independent code review identified a misleading pending label on failed metrics; corrected to an unavailable label.

Confirmed root cause from the user-provided ChatGPT run result: the 09:00 task had no same-day cache, its force-reset fallback was rejected by tool safety checks, and it paused its own schedule. Advance prewarming to 05:17/07:17, replace branch mutation with normal workflow dispatch, and document preserving the enabled schedule. Resuming the hosted ChatGPT task requires access to that task; repository changes cannot do it.
