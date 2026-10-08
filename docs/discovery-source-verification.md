# AI news and Discovery source rollout — 2026-10-08

Four bounded public inventory adapters are registered as `SHADOW` in `data/crawler-sources.json`. They now run inside the existing daily Playwright workflow and write results under `shadowSources`. They are not automatically published as news or assumed relevant to AI.

| Source | Collection method | Local live validation | Evidence retained |
| --- | --- | --- | --- |
| Hacker News | Official Firebase top-stories API, first 30, batches of 5 | 30 stories | Discussion/original links, publication time, points/comments, observed time/rank |
| GitHub Trending | Public daily trending page | 13 repositories | Repository URL/title/description, visible stars/forks, observed time/rank |
| Hugging Face models | Public trending model listing, first page | 30 models | Model URL, card text, observed time/rank |
| Hugging Face Spaces | Public trending app/demo listing, first page | 24 Spaces | Space URL, card text, observed time/rank |

Counts are observations, not expected constants. `node scripts/verify_discovery_sources.mjs` writes a full fresh local report to `artifacts/discovery-source-verification.json`; the daily workflow retains its own timestamped cache and artifact. Unknown metrics are omitted, never inferred as zero. Top lists are broad leads; no keyword heuristic silently discards possible AI items.

GeekNews returned HTTP 403 in the local browser probe and remains `WATCH_ONLY`, without an automated crawler specification. Accessible editorial/web inspection is still possible; there is no access-control bypass. Reddit/X and other directories have not been validated by this rollout and are not claimed as automated sources.

Deterministic fixture tests cover link/title extraction, duplicate suppression, source rank, real zero versus unavailable metrics, HN discussion/original URL separation and dates, and explicit failures for HTTP blocks or empty changed layouts. Lifecycle tests cover category/track retention on promotion and prevent repeated same-day evaluations from manufacturing reliability evidence.

Promotion uses the existing gates: at least two discovery sightings, one actual published hit, three successful shadow daily evaluations, and score at least 50. A paused/missing ChatGPT editorial run prevents research-based lifecycle advancement; crawling alone does not fabricate publication evidence. The editorial task must inspect useful shadow leads and cite the exact manifest key in `sourceDiscoveries`.

Scheduled cache reuse requires records for newly configured shadow candidates, so adding a source does not silently skip its first collection. Manual dispatch refreshes all configured sources. Repeated same-day source-evolution runs are no-ops; the next research date supplies the next reliability observation.

References: [official HN API](https://github.com/HackerNews/API), [GitHub Trending](https://github.com/trending?since=daily), [HF models](https://huggingface.co/models?sort=trending), [HF Spaces](https://huggingface.co/spaces?sort=trending).
