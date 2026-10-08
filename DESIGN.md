# Daily Brief UI system

Daily Brief is a public desktop website for browsing AI news, tools, open source, contests and startup support. Scheduled GPT research supplies JSON snapshots; the website is the reading and discovery surface, not an automation dashboard.

## Runtime and data contract

- Static HTML and JavaScript, with Ionic Core 9.0.6 Web Components and Ionicons. All components use iOS mode via global configuration and explicit component attributes.
- `data/latest.json` is the current snapshot. `?date=YYYY-MM-DD` reads `data/archive/YYYY-MM-DD.json`.
- Keep the snapshot schema, research evidence, promotion workflow, and Pages deployment unchanged. A data-only update requires no frontend build.
- Show the snapshot date as the briefing date, not the viewer's clock. Historical snapshots include a return-to-latest link.
- Ionic supplies actual search, segments, select popovers, list items, buttons, chips, cards, and icons. No decorative imitations of native controls.
- `assets/styles.css` is the single product style source. Primer and the legacy Apple UI override layer have been removed.
- The full Ionic bundle assumes an app viewport and fixes the body. This website explicitly restores `position: static; height: auto; overflow: visible` on the body so browser scrolling and route scroll restoration work.
- References: [Ionic item content and actions](https://ionicframework.com/docs/api/item). Wrap composed row content in a single slotted element; do not style undocumented shadow parts.

## Shared visual rules

| Token | Value / rule |
| --- | --- |
| Workspace | Header, body and footer share a centered 1240px maximum frame; 28px internal desktop gutters |
| Paper | #ffffff |
| Neutral surface | #fbfbfd masthead; #edeef3 recessed controls; white continuous reading area |
| Title text | `--text-title`: #292535, headings and item titles |
| Key labels | `--text-label`: #343445, weight 600 for fact/filter labels |
| Body text | `--text-body`: #343844, summaries and fact values |
| Secondary text | `--text-secondary`: #606775, supporting UI descriptions |
| Record metadata | `--text-meta`: #687180, registration/verification/update dates |
| Divider | #e1e1e7 |
| Action / selection | #5b3fc4 |
| Urgency | #b42318 |
| Type | Self-hosted Wanted Sans Variable 1.0.3 with system fallback; SIL OFL license in assets/fonts/WantedSans-OFL.txt |
| Page title | 34px categories and Home; 30px detail |
| Section / item | 22px / 19–20px |
| Body / metadata | 16px / 13px; descriptions and summaries remain 16px on mobile |
| Spacing | 8px base; 24px card padding; 32–48px section gaps |
| Geometry | 12px opportunity cards; 7–9px controls; reading lists and detail sections use dividers, not boxes |

Use a compact neutral masthead, continuous white reading surfaces, restrained dividers, left-aligned text, and clear title hierarchy. Violet identifies actions and selection; red is reserved for urgency. Content can wrap; never shrink text to squeeze it in. The approved brand direction below defines decorative materials.

### Information color and weight

Small text is not automatically secondary. Target, prize, deadline and benefit labels are scanning anchors: use `--text-label` at weight 600 on opportunity cards, detail summaries and detail tables. Filter group labels follow the same rule. Fact values and content summaries use `--text-body` at normal weight. Classification labels use `--text-label` at weight 500.

Registration, verification and update dates use `--text-meta`. An application deadline is decision information, not record metadata: card deadline dates use `--text-body` at weight 500. Existing urgent status text retains red and an explicit deadline label; neutral statuses do not imply success. Source names stay readable secondary text. Do not assign arbitrary colors to target/prize categories or reduce text opacity to create hierarchy.

Semantic text tokens are defined once in the first `:root` of `assets/styles.css`; legacy `--ink`, `--muted` and `--meta` are aliases. Component rules select a role rather than inventing a gray. Maintain at least 4.5:1 contrast for normal text on its rendered surface, including card facts and filter backgrounds.

## Page composition

- Shared top identity/search row and horizontal primary navigation on every page. Archive is a persistent destination.
- Home: briefing introduction, quick filters, real Ionic segment for sort, readable feed. Default ordering rotates news, discovery, contests and support so one subject cannot dominate. A secondary column contains a complete chronological deadline list, topics and archives; new and updated items remain accessible through the feed filters.
- AI news: topic/status filters and sort, followed by a readable list. Each story shows a title, a short summary and nearby dates; context and tags remain available in detail. Reading width is capped at 1280px.
- Discovery: three compact recommendations across different primary groups, category shortcuts that operate the existing filters, and one complete catalog. Do not repeat complete lists for each group.
- Contests and support: two equal card columns on desktop and tablet, one below 700px. Cards contain category/status, title, short summary, source eligibility and reward fields, and deadline. Never clamp eligibility or benefits; the full conditions must remain readable.
- Detail: same header/navigation, readable title and introduction, uncompressed source buttons, deadline/eligibility/benefits near the title, followed by detailed application conditions, history, ideas and links. Empty sections are omitted by the existing renderer.
- Archive: date list with the same type/control language. Viewing a date preserves the underlying snapshot.
- Compact screens are a fallback: horizontal top navigation, one content column, wrapped controls. They do not determine desktop proportions.

## Interaction and accessibility

- Native links for navigation, source links, search results, and Ionic cards. Ionic list items keep native button behavior.
- Filter chips support Enter and Space. Navigation exposes `aria-current` and interactive elements have visible focus.
- Search supports the button, Ctrl/Cmd+K, and Escape.
- Keep filter state when returning from detail; restore browser scroll at the document level.
- Respect reduced motion and keep a light palette even when OS dark mode is enabled.

## Verification and captures

`npm run test:ui` starts its own temporary static server and checks all routes at 1920×1080, 1440×900, 1280×800, plus a 390px fallback. It covers the shared 1240px frame, readable row geometry, two-column opportunity cards, overflow, unique IDs, filtering, sorting, keyboard navigation, search, all detail types, archive return, and consumption of an updated scheduled JSON snapshot.

`npm run capture:ui` writes 18 screenshots and an HTML gallery to `artifacts/ui-final/`. Capture files are local review artifacts and are ignored by Git. On Windows, the scripts use installed Edge; elsewhere install Playwright Chromium (`npx playwright install chromium`). `BROWSER_CHANNEL` overrides the browser channel.

Before completion, inspect the screenshots, verify no browser errors, and run `python scripts/validate_data.py` and `python scripts/test_evolve_crawler_sources.py`. Screenshots alone do not prove interactions or scrolling work.

## Service quality and Korean copy

The product should feel like a dependable professional information service: consistent Korean typography, practical density, stable navigation, accurate status labels, and useful feedback. Enterprise quality does not require admin widgets, excessive decoration, or invented analytics.

- The masthead stays available while reading. Section jumps clear it and focus the destination without changing the route.
- Catalog filters show the number of matching results and offer a reset to the default scope. Upcoming opportunities are labeled “접수 예정”; the default “모집 중·예정” scope includes them.
- Detail breadcrumbs identify the current category. “목록으로” always returns to that category, including when the detail URL was opened directly.
- Search explains what can be searched before input and suggests another query when no results match.
- Page titles and descriptions are factual: “오늘의 브리핑”, “공모전과 해커톤의 접수 일정, 참가 자격, 상금을 확인하세요.” Avoid promotional slogans and abstract translated phrasing.
- `AUTOMATION.md` contains the same editorial standard for future generated content. Historical source data is not silently rewritten by the UI.
- [Pretendard upstream](https://github.com/orioncactus/pretendard), pinned v1.3.9. Font files are served locally with font-display: swap, so no third-party font request is needed at runtime.

`npm test` runs both the layout/interaction suite and the focused UX suite. `npm run test:ux` checks filter feedback/reset, section jumps, search guidance, direct detail navigation, and upcoming status rendering.

## iOS refinement

Desktop navigation uses real Ionicons and a clear blue selected state. Home filters use a compact segmented treatment; the existing Ionic sort segment, search, select popovers and cards remain functional components. Group whole reading lists rather than creating a dashboard of individual tiles. No blur or glass. Press feedback responds only to user action.

## Role separation and review

Navigation uses blue selected location; filters use compact low-emphasis chips; sort and search retain real Ionic behavior. Opportunity cards use a quiet edge/shadow for side-by-side comparison. News, Home, Discovery catalog and detail use continuous reading surfaces. Avoid applying the same panel and shadow to every role.

At 1280×800, first opportunity cards should begin before 390px. Preserve legibility rather than reducing the font size. Keep all four subjects in Home's first four default entries. A deadline list must include today's deadlines regardless of which items are in the main feed.

The 2026-10-07 Discovery copy was edited in both latest.json and its same-date archive: summary, description, why and discoveryReason only. IDs, links, dates, categories, signals and all other fields remain intact. Earlier archives remain unchanged. This is an explicit editorial change, not a rendering-time substitution.

Visual audit: artifacts/design-audit.md; re-audit: artifacts/design-reaudit.md. Automated checks do not replace the designer's visual verdict.

## Reference-led material treatment

The two user-provided reference images supersede the earlier blanket avoidance of gradients. They establish layered white faces, narrow spectral edges and contact shadows rather than blur/glass. Preserve the audited desktop information structure.

- App frame: at most 1240px including internal gutters; header, main and footer share that width. Pearl outer canvas, solid white interior, subtle perimeter shadow. No backdrop blur.
- Home: one compact document cover with a narrow spectral edge; continuous reading list with identical peer row surfaces. The deadline reference panel remains distinct.
- Discovery recommendations: a colored sheet protrudes behind a solid reading face. Color stays at the edge; body text retains neutral contrast.
- Opportunity cards: a raised title face over the comparison facts. All opportunity edges stay neutral; spectral emphasis is reserved for the Home header, detail summary and Discovery recommendations. Full source eligibility and benefits stay readable.
- Detail: one edged summary face, followed by continuous information sections. Do not put every section in a raised card.
- Controls: inset search and segment track; raised selected control; subtle directional light on primary buttons. No perpetual animations.
- Material tokens live in the final material-system block of assets/styles.css. Readable geometry, three columns and keyboard behavior must pass alongside visual captures.

## Designer-directed implementation

The current material system follows artifacts/designer-direction.md. No first-item emphasis, position-based recommendation colors, or abstract header ornament. Deadline panel styling is attached to its semantic class. Navigation and filter states are flat; exclusive segment selection uses a raised white thumb. Discovery recommendations share one brand-gradient back sheet behind opaque white faces. Material rules are consolidated in one replacement block, not appended exceptions. Metadata uses #687180 in place of the proposed #747B88 to maintain 4.5:1 contrast on light surfaces.

## Editorial grid refinement

The latest designer directives are artifacts/layout-options.md and artifacts/enterprise-design-gap.md. They supersede the earlier full-width news/discovery lists.

- News: row-major two-column grid at desktop widths, maximum 1240px. Full titles, two-line summary preview, a single labeled updated/registered date. Metadata remains in detail. Thin row rules, no elevated news boxes.
- Discovery: one catalog, maximum 1320px; three columns above 1359px, two below, one on compact mobile. Recommended/new/rising status intersects independently with the type filter. Recommendations preserve the original diverse ranked selection and gain the shared back-sheet treatment only when that filter is active. Reset restores both axes. Workflow discovery includes the existing primary-group classification.
- No top recommendation duplicate, section-jump row or redundant group listing. Full source tags remain in detail; cards display two tags and a remainder count. Native card anchors preserve modifier-click navigation.
- Shared filters are 36px. Viewing-order controls retain the actual Ionic segment. Informational states are neutral; existing withinWeek deadlines use urgency color. Home classification icons are flat and 28px; the brand mark alone retains raised-icon treatment.
- Opportunity facts are 14px without clipping; title minimum height and the internal title-face shadow are removed. Sources pair their original label with a concise action. Record dates in detail include their original year. No inferred deadline time or date is generated.

Verification includes two-axis filter combinations, reset, 3/2 catalog geometry, 2-column news row order, and first catalog at or above 350px on 1280. Screenshots: artifacts/ui-final. Designer re-review: artifacts/catalog-enterprise-review.md.

## Approved brand direction: light along the paper edge

The user approved the first direction in artifacts/brand-directions.md. Brand identity applies to ordinary entries, not only recommendations. Main violet #5B3FC4 identifies the brand, actions, selection and focus. Teal #4FAEAD is decorative edge light only, never small text or a safety state. Body ink is #292535 and outer pearl canvas #F2F1F7. Existing urgency/error meanings remain unchanged.

Every catalog and opportunity card receives the same 3px violet-to-teal lower cross-section with a slight lower-right paper thickness and contact shadow. News uses the same direction in a 2px lower rule without turning each entry into a box. No position-based or random colors. Recommendation filtering adds an 8px rear sheet and an explicit 추천 label; ordinary cards retain their signature edge. Apricot #E6B09B is restricted to the Home/detail cover edge. All content faces stay opaque and neutral.

The existing two-column news / three-or-two-column Discovery / three-column opportunities are preserved. Brand implementation changes CSS, the favicon color, and decorative non-interactive markup only; source data and collection contracts are unaffected.


## Current page layout: shared 1240px frame

This section supersedes historical viewport-dependent widths and column counts above. The AI news reading width provided the reference for the user's requested common page size. Header, main and footer now have the same maximum border-box width of 1240px, centered within the viewport, with 28px internal desktop gutters. Narrow viewports reduce the frame and gutters without horizontal page overflow. Dialogs and auxiliary areas retain their functions.

The final shared-geometry block in assets/styles.css owns this layout through --page-max, --page-gutter and --layout-gap:

- Common header, navigation, page titles and footer use consistent left and right edges. Compact filter rows use dividers and preserve the existing controls.
- Home retains the deadline sidebar at 272px, with 28px between it and the feed. Row status moves below the summary to give long headlines more room. Below 1000px the sidebar follows the feed.
- AI news retains two reading columns, falling back to one below 850px.
- Contests and support use two spacious comparison cards per row, falling back to one below 700px. Eligibility and rewards remain fully visible.
- Discovery uses three columns above 1100px, two up to 1100px, and one below 700px. Column count no longer varies on large monitors once the page reaches its maximum width.
- Detail keeps source actions next to its summary on desktop and below it on mobile; the reading content is capped at 960px inside the shared page frame.

Validation: centered frame and aligned edges across all six primary routes at 1920, 1440 and 1280px, readable card geometry, mobile overflow, existing search/filter/navigation tests, and refreshed screenshots in artifacts/layout-1240-review.


## Daily summary and content structure

The current Home is a daily summary, not an inventory or sorting interface. It has three sections: new registrations on the snapshot date, existing entries updated on that date, and open opportunities closing within seven days of that date. Each section shows at most five items and its total count. Deadline items appear only in the deadline section, ordered by deadline; closed opportunities are excluded. Empty sections explicitly report no changes. Full catalogs remain accessible through navigation and the bottom browse links. The former alternating-subject/latest sort and Home filter controls have been removed. Snapshot dates remain visible and never derive from the viewer clock.

Opportunity cards separate summary, eligibility, benefits and deadline with neutral horizontal dividers. Two-column news has a neutral vertical divider inside the second cell of each row; it disappears in the single-column layout. This avoids clipping by Ionic's native item surface.

Discovery separates three independent axes: editorial status, purpose, and source. Purpose labels are AI 도구, 도구 모음, Skill · MCP · Agent, 제작 사례. Directory is an internal source type, never a user-facing purpose label. Showcase collections (including Prompt Motion and Remotion) are 제작 사례; tool directories are 도구 모음. GitHub-hosted skill collections are Skill · MCP · Agent. The GitHub source filter includes every entry with a repository-root link, regardless of purpose. Reset clears all three axes. The original source schema is preserved.

GitHub cards on the latest briefing fetch public repository stargazers_count and forks_count from the GitHub REST repository endpoint. Counts are current observations, not historical snapshot data: show a Korea-time retrieval timestamp. Successful requests are cached for 15 minutes in session storage and in-flight requests are shared. Failed requests display 조회 불가, never zero; genuine zero counts remain visible. Historical archive pages do not request or show current counts. No credentials are embedded in the client. See https://docs.github.com/en/rest/repos/repos#get-a-repository.

Tests cover purpose/source intersections, repository-backed skills, count formatting, zero counts, API failure, request reuse, historical isolation, empty daily summaries, actual update dates, deadline ordering and duplicate prevention. Captures: artifacts/content-structure-review.


## Reading scale

Content descriptions, page introductions, Home section explanations, news summaries, Discovery descriptions, opportunity summaries and fact values, detail prose and timeline explanations use --font-body-size (16px), --line-body (1.65) and --text-body (#343844). Mobile layouts retain that scale. Key fact labels use --font-label-size (14px) and weight 600; metadata stays 13px. GitHub observation timestamps are also at least 13px.

Descriptions wrap naturally instead of using CSS line clamps or smaller type to fit a card. The cards expand with content. Titles, controls and genuine record metadata have separate roles; a small label is not a reason to dim substantive prose. Typography properties in the existing component and mobile rules reference the shared tokens so later layout rules cannot silently shrink descriptions again.


## Larger global type scale

The user requested a further increase across the entire interface. This supersedes the previous 16px prose scale: body/descriptions/fact values are 18px, key labels and navigation/filter/sort controls are 16px, and record metadata is at least 14px. Card headlines are 22–23px and page headings are 36px on desktop (32px on compact screens). Mobile retains the 18px body and 16px controls. Controls grow to at least 44px tall, the sticky header has matching scroll clearance, and labels have wider columns. Opportunity titles wrap without clipping. Page width remains 1240px; content density yields to legibility.


## Selected typeface

Wanted Sans Variable v1.0.3 is the selected product font, self-hosted at assets/fonts/WantedSansVariable.woff2. Its supported weight range is 400–1000. The upstream SIL OFL license is retained at assets/fonts/WantedSans-OFL.txt. It replaces Pretendard while retaining the larger global type scale. The previous Pretendard asset remains available for the local comparison artifact only.
