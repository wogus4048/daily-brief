# daily-brief Design System

This document is the visual and content source of truth for `daily-brief`.

The approved direction combines:

- **Warm editorial visual language** for a human, readable, non-generic feel.
- **Developer-product information density** for fast scanning, tables, metadata and filtering.

Do not replace this direction with a new visual style during implementation. New prompt libraries, design-system references or AI-generated ideas are reference material only unless this document is explicitly revised.

## 1. Product character

`daily-brief` is a public information product for developers and builders.

It should feel:

- informed, calm and useful
- dense enough to scan quickly
- warm enough to avoid looking like a generic admin dashboard
- structured like software, not like a newspaper
- editorial in color and typography, not in multi-column article layout

It should not feel:

- like an AI-generated SaaS landing page
- like a mobile app stretched to desktop
- like a black/white wireframe
- like a crypto or cyberpunk console
- like a marketing dashboard full of KPI cards

## 2. Reference mix

Use these references for principles, not pixel copying:

- **Primer / GitHub**: navigation, information hierarchy, list/table density, keyboard interaction, semantic states.
- **Tablekit prompt**: tabular information, compact metadata, semantic color used in small areas.
- **Warm Editorial Week Planner prompt**: warm ivory canvas, terracotta/sage/dusty-blue/amber families, human visual tone.
- **Atlassian content design**: clear, concise and consistent UI language.

Rejected directions:

- Linear-style indigo dashboard as the dominant visual language
- glassmorphism
- gradient hero surfaces
- large dark featured cards
- bento/KPI card farms
- neon terminal aesthetics
- newspaper/broadsheet layout

## 3. Layout

Desktop-first.

- Content max width: **1360–1440px**.
- Sticky top header with brand/search/date and horizontal category navigation.
- No permanent left sidebar on desktop.
- Home information order:
  1. compact daily intro
  2. primary items + right context rail
  3. category overview
  4. compact all-items list/table
  5. reusable resources
  6. upcoming deadlines
  7. archive
- Detail pages use main content + narrow facts/links rail.
- Mobile reflows the same information; it is not the design source of truth.

## 4. Typography

Readability wins over density.

Primary UI font:

```text
Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif
```

Editorial display stack may be used sparingly for brand or major section display text only when Korean rendering remains good:

```text
"Noto Serif KR", "Iowan Old Style", Georgia, serif
```

Do not make the whole interface serif.

Minimum desktop sizes:

- body: **16px**
- descriptive copy: **14–16px**
- primary feed title: **18–20px**
- table/list title: **14–16px**
- navigation: **13px**
- metadata/labels: **11px minimum**
- section title: **22–26px**
- page title: **34–40px**

Minimum mobile sizes:

- body: **15px**
- descriptive copy: **13–14px**
- primary feed title: **17–19px**
- metadata: **10px minimum**
- navigation: **12px**

Do not use 7–9px UI text except for a non-essential decorative mark.

Use monospace only for:

- dates
- counts
- D-day values
- short technical metadata

Do not set whole sections in monospace.

## 5. Color

Base is warm, not pure white/cold gray.

Core palette:

```text
canvas            #F6F1E9   warm ivory
surface           #FFFDF9
surface-subtle    #F2ECE3
ink               #292520
ink-secondary     #655D55
ink-muted         #887E74
border            #DED3C6
border-strong     #C7B9AA

terracotta        #A85C3E
terracotta-soft   #F8E8DF
sage              #71816A
sage-soft         #E9F0E5
dusty-blue        #687F95
dusty-blue-soft   #E9EEF3
amber             #B9873F
amber-soft        #F6ECD7
violet-muted      #786F90
violet-soft       #EFECF4
```

Semantic use:

- AI / tools / research: dusty blue family
- GitHub / open source: neutral stone family
- contests / deadlines: amber family
- startup / support: sage family
- reusable reference material: muted terracotta or violet family
- destructive/error only: red

Rules:

- saturated color covers a small percentage of the page
- large backgrounds use soft tints only
- do not color every badge differently
- color must communicate category/state or hierarchy
- no decorative gradients

## 6. Surfaces, borders and shadows

- Cards are allowed when they group a meaningful unit, not as the default container for every piece of text.
- Standard radius: **6–10px**.
- Dense list/table rows remain mostly flat.
- Use 1px warm borders for separation.
- Shadows are subtle and rare; never use glow shadows.
- Section backgrounds may use muted tints to help orientation.

## 7. Information density

Dense does not mean tiny.

- Reduce repeated prose before shrinking type.
- Secondary metadata may collapse on mobile.
- Use tabular rows for large comparable collections.
- Use cards for category overview or resource groups where grouping helps comprehension.
- Primary daily items should contain title + concise summary + only the most useful metadata.
- The right rail is context, not a KPI dashboard.

## 8. Components

### Header

- horizontal category navigation
- search is visible on desktop
- active category uses a restrained terracotta or ink underline
- no icon-only rail

### Primary daily item

- number/rank optional
- semantic category label
- title 18–20px
- 1–2 line summary
- optional `눈여겨볼 점` only when there is real editorial value
- no giant featured treatment

### Category overview cards

- six or fewer in one section
- soft semantic background families
- 2–3 compact item links each
- no marketing copy inside cards

### All-items table/list

- desktop uses visible columns
- mobile hides low-priority columns instead of shrinking text
- title and summary are the visual anchor
- status uses concise natural Korean

### Status/tag chips

- compact rectangle, 4–6px radius
- soft fill and dark text
- use only when the label adds information
- avoid pill-shaped decoration by default

## 9. Korean UI language

Use Korean that sounds natural in a real Korean product.

Preferred examples:

- `오늘 새로`
- `최근 업데이트`
- `요즘 많이 보이는 주제`
- `눈여겨볼 점`
- `요즘 뜨는 항목`
- `알려진 정도`
- `최근 변화`
- `어디서 찾았나`
- `다가오는 마감`
- `계속 참고할 만한 것`

Avoid translation-like / AI-product wording:

- `현재 신호`
- `상승 신호`
- `고신호`
- `왜 볼 가치가 있나`
- `발견 이유`
- `신호 수집`
- `signal score`
- `high signal`
- `indexed`
- `tracked`
- `baseline`
- `open opportunities`

English is allowed for established technical proper nouns (`GitHub`, `MCP`, `Skill`, product names), not for generic UI labels when natural Korean exists.

## 10. Anti-pattern gate

Reject a design if any of these dominate the page:

- tiny gray metadata everywhere
- white background + black text with no information grouping
- purple/blue gradient hero
- giant headline for a utility page
- rounded card around every row
- bento layout used only because it looks fashionable
- repeated pill badges
- glow effects
- glass blur as decoration
- left sidebar copied from generic SaaS products without a navigation need
- generic wording such as `Signals`, `Insights`, `Intelligence`, `Explore` used where a concrete Korean label is clearer

## 11. Review gate

Before production UI changes are merged:

1. Compare the implementation with this file.
2. Render with real `data/latest.json` content.
3. Capture at least 1440px, 1024px and 390px widths.
4. Verify no horizontal overflow or console errors.
5. Inspect computed type sizes against the minimums above.
6. Search visible copy for banned phrases.
7. Review whether color helps orientation rather than decoration.
8. Only then merge and deploy.

