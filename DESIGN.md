# daily-brief Design System

`daily-brief` uses **Primer CSS as its UI foundation**.

This document exists to keep implementation aligned with Primer instead of drifting into custom AI-generated styling.

## 1. Foundation

Primary UI system:

- `@primer/css`
- current adopted version: `22.3.2`
- vendored build: `assets/vendor/primer.css`
- generated from Primer modules through `npm run build:styles`

The vendored file is Primer's official `dist/primer.css` build. Do not hand-pick or fork Primer modules unless bundle size becomes a demonstrated problem.

Do not re-create buttons, form controls, labels, focus states, spacing scales, borders, or semantic colors when Primer already provides them.

## 2. Design goal

The product should feel like a useful developer information surface:

- compact but readable
- neutral and functional
- easy to scan
- stable across pages
- closer to a mature developer product than a marketing dashboard

It should not feel like:

- an AI-generated SaaS landing page
- a custom mood-board experiment
- a newspaper layout
- a card farm
- a black/white wireframe
- a dashboard decorated with arbitrary colors

## 3. Primer ownership boundary

Primer owns:

- color tokens
- semantic states
- border and radius conventions
- buttons
- form inputs and selects
- labels
- focus treatment
- spacing scale
- typography defaults and utilities
- common layout utilities

Project CSS owns only what Primer does not know about:

- Daily Brief page layout
- widths and column structure
- information hierarchy specific to this product
- responsive reflow of Daily Brief sections
- a small amount of component composition around Primer primitives

When custom CSS introduces a raw color that could be expressed with a Primer token, replace it with a Primer token.

## 4. Theme

Use Primer light mode:

```html
<html data-color-mode="light" data-light-theme="light">
```

Prefer Primer variables such as:

```text
--bgColor-default
--bgColor-muted
--fgColor-default
--fgColor-muted
--fgColor-accent
--borderColor-default
--borderColor-muted
--bgColor-accent-muted
--bgColor-success-muted
--bgColor-attention-muted
--bgColor-done-muted
```

Do not add a separate site-wide custom palette unless a real product requirement appears.

## 5. Components

Use Primer components directly where possible.

### Buttons

Use:

```text
.btn
.btn-primary
.btn-sm
```

Do not custom-build generic buttons.

### Forms

Use:

```text
.form-control
.form-select
.input-block
```

Search and filtering controls should look and behave like standard Primer controls.

### Labels

Use:

```text
.IssueLabel
```

Labels are for compact metadata and states, not decoration.

Semantic label colors should come from Primer tokens.

### Utilities

Prefer Primer utility classes for ordinary spacing, display, borders, background, and text color:

```text
.border
.border-bottom
.rounded-2
.color-bg-default
.color-bg-subtle
.color-fg-muted
.p-*
.m-*
.d-flex
```

Do not add a custom class just to reproduce an existing Primer utility.

## 6. Layout

Desktop-first.

- maximum content width: about 1460px
- sticky top header
- all primary routes use a Product Hunt-inspired three-column shell
- left rail = navigation / scope selection
- center = the primary feed and the visual focus of the page
- right rail = time-sensitive/contextual information
- only the center content changes between home, category, discovery, archive, and detail routes

Global shell:

1. header: brand + search + date
2. left rail: categories, quick views, archive
3. center: route-specific primary content
4. right rail: upcoming deadlines, new items, trending topics, recent updates

Home uses one continuous ranked/dated feed. Category, discovery, archive, and detail routes use the same shell and should keep their center content flat and row-oriented instead of reverting to full-width dashboard/card layouts.

The current Product Hunt homepage is the visual reference for home typography and surface treatment. The reference values observed on 2026-10-07 include:

```text
primary text      #21293c
secondary text    #4b587c
border            #d9e1ec
accent            #ff6154
row hover         #feede6
font stack        ui-sans-serif, system-ui, sans-serif
product name      18px / 600 / 28px line-height
detail/meta       14px class of text
```

Primer remains the implementation foundation underneath this page language; Product Hunt is the page-level layout/visual reference.

The information architecture remains project-owned; Primer provides the UI grammar.

## 7. Typography

Do not shrink typography to create density.

Desktop targets:

- body: 16px
- primary item title: 18px or larger
- descriptive text: 14px or larger
- metadata: 11px or larger
- navigation: 13px or larger
- page title: about 32–36px

Mobile targets:

- body: 15px or larger
- primary item title: 17px or larger
- metadata: 10px or larger
- navigation: 12px or larger
- search input: 16px to avoid mobile zoom

Use Primer's font stack and weight tokens.

## 8. Semantic color

Color communicates meaning only.

Use Primer semantic token families:

- accent: AI/news/navigation emphasis
- success: support/open/success states
- attention: deadlines/contests/warnings
- done: reference/resources where needed
- neutral: open source/general metadata
- danger: errors or genuinely urgent destructive states

Do not assign a decorative color to every section just to make the page look more designed.

## 9. Density

Dense means reducing repetition, not reducing readability.

- Prefer flat list rows for repeated content.
- Use bordered surfaces only when grouping helps comprehension.
- Keep comparable fields aligned in columns.
- Hide low-priority columns on mobile rather than shrinking them.
- Avoid giant featured cards for ordinary content.
- Avoid KPI cards unless there is an actual decision-making need.

## 10. Korean UI language

Use plain, natural Korean.

Preferred examples:

- `오늘 새로`
- `최근 업데이트`
- `눈여겨볼 점`
- `요즘 많이 보이는 주제`
- `다가오는 마감`
- `계속 참고할 만한 것`

Avoid:

- `현재 신호`
- `상승 신호`
- `고신호`
- `왜 볼 가치가 있나`
- `발견 이유`
- `signal score`
- `high signal`
- `tracked`
- `baseline`
- `open opportunities`

English is appropriate for real technical names such as GitHub, MCP, Skill, Agent, product names, and established industry terms.

## 11. Anti-patterns

Reject changes that introduce:

- custom gradients
- glassmorphism
- glow effects
- random pastel section coloring
- custom button systems beside Primer buttons
- rounded cards around every row
- tiny gray metadata
- huge marketing headlines
- decorative dashboard statistics
- copied Linear/Vercel aesthetics without a product reason

## 12. Review gate

Before merging UI work:

1. Run `npm run build:styles` and verify the vendored Primer CSS is current.
2. Confirm visible generic controls use Primer component classes.
3. Render real `data/latest.json` content.
4. Capture 1440px, 1024px, and 390px layouts.
5. Check for horizontal overflow and console errors.
6. Verify readable font-size minimums.
7. Check mobile target sizes.
8. Search visible copy for banned phrasing.
9. Confirm custom CSS uses Primer tokens rather than an independent palette.
10. Only then merge and deploy.
