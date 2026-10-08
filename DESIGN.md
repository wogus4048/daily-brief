# daily-brief Apple Platform Design System

`daily-brief` should use an Apple-HIG-inspired web implementation, not claim to be a native Apple UI.

The page-level visual source of truth is Apple Human Interface Guidelines (HIG), with an iPadOS-style split view on wide screens and an iOS-style single-pane/tab-bar layout on compact screens.

Important: this is a web implementation, not UIKit or SwiftUI. Native Apple components cannot run directly in a browser.

The component foundation is now **Ionic Core 9.0.6 in explicit `mode="ios"`**, loaded as standalone Web Components. Ionic supplies the actual component structure, iOS-mode control chrome, interaction states, and Ionicons. The current production UI uses real `ion-searchbar`, `ion-segment`, `ion-list`, `ion-item`, `ion-chip`, `ion-select`, `ion-button`, `ion-tab-bar`, `ion-tab-button`, and `ion-icon` elements.

`@primer/css` remains loaded only for legacy compatibility with older markup. It is **not** the visual source of truth.

Ownership order:

1. Ionic iOS mode owns standard component appearance and behavior.
2. `assets/apple-ui.css` owns Daily Brief layout, density, sizing, and semantic product tokens around Ionic components.
3. Custom CSS must not redraw an Ionic component when Ionic already provides the needed control.

## 1. Product character

The product should feel:

- quiet
- native
- precise
- information-dense without feeling cramped
- layered rather than boxed
- obvious to navigate
- readable before decorative

It should not feel like:

- Windows 95/98/XP UI
- a generic admin dashboard
- a pile of colored status cards
- a Product Hunt clone
- a GitHub clone
- an AI-generated SaaS landing page
- a collection of unrelated component styles

## 2. Platform model

### Wide desktop

Desktop is the primary presentation target for the public site.

- maximum workspace width: 1760px
- use the available horizontal space for browseable content instead of keeping a mobile-webview-like narrow center
- at large widths, contests and support programs use a three-column card grid

Use a split-view structure:

1. navigation/toolbar material at the top
2. leading sidebar for navigation and scope
3. primary content pane
4. trailing inspector/context pane when space permits

The sidebar and inspector belong to the control/navigation layer and may use translucent material.

### Medium widths

Use two panes and reduce card columns only when the viewport actually requires it:

1. sidebar
2. primary content

Hide the trailing inspector before compressing the main content too far.

### Compact / phone widths

Phone support is a responsive fallback, not the layout baseline.

Use a single content pane:

- hide sidebars
- show a persistent bottom tab bar for top-level navigation
- keep search in the top navigation area
- preserve route state while moving between tabs

Do not squeeze a desktop sidebar into a phone layout.

## 3. Materials

Use Liquid-Glass-like material only for controls/navigation:

- top toolbar
- sidebar
- trailing inspector
- bottom tab bar
- search sheet

Implementation uses translucent backgrounds, `backdrop-filter`, subtle separators, and small shadows.

Do **not** use glass inside the scrolling content layer.

Content uses standard grouped surfaces:

- system grouped background
- white/dark secondary grouped surfaces
- inset grouped lists
- subtle separators

## 4. Dynamic color model

Use light-mode semantic tokens defined in `assets/apple-ui.css`, with Ionic's primary color mapped to iOS system blue.

Light references:

```text
system background       #f2f2f7
secondary group         #ffffff
system blue             #007aff
system red              #ff383c
primary label           #000000
secondary label         rgba(60,60,67,.68)
separator               rgba(60,60,67,.20)
```


Rules:

- do not use category-specific colored blocks
- blue means selection, navigation, link, or primary action
- red means danger/urgency
- use neutral fills for ordinary metadata
- do not make AI/news/support/contest rows different background colors
- color is not decoration

## 5. Typography

Prefer the Apple system stack:

```css
-apple-system,
BlinkMacSystemFont,
"SF Pro Text",
"SF Pro Display",
system-ui,
"Segoe UI",
sans-serif
```

Do not bundle or redistribute Apple font files.

When the page runs on Apple platforms, the system font should resolve to San Francisco/SF Pro. Other platforms use their native fallback while preserving Apple-like metrics and hierarchy.

Recommended hierarchy:

- large view title: 27–30px, 700
- grouped section title: 18–20px, 700
- primary row title: 16–17px, 600–650
- descriptive text: 13–14px
- metadata: 11–12px
- tab labels: 10px

Never shrink body copy to create density.

## 6. Navigation components

### Top toolbar

Contains only global controls:

- app identity
- search
- date/context

Avoid repeating category navigation in the toolbar when the sidebar/tab bar already provides it.

### Sidebar

Sidebar is for app hierarchy, not analytics.

Groups:

- Today
- content areas
- quick views
- archive/history

Selected rows:

- subtle system-blue tint
- system-blue icon/text
- rounded selection shape

No bright colored category icons.

### Bottom tab bar

Use Ionic's real `ion-tab-bar` and `ion-tab-button` components in `mode="ios"`.

Compact layout uses five top-level destinations:

- Today
- AI
- Discover
- Contests
- Support

The tab bar floats above content using translucent material and remains visible while navigating.

## 7. Search

Search is a primary global control.

Use Ionic's real `ion-searchbar mode="ios"`.

Its built-in search icon, clear-button behavior, native input geometry, and focus behavior should be preserved. Product CSS may change width and semantic colors, but should not rebuild the internal search field.

The search dialog behaves visually like a sheet:

- large rounded corners
- translucent material
- blurred backdrop
- grouped result rows

## 8. Segmented controls and filters

Use Ionic's real `ion-segment` + `ion-segment-button` in iOS mode for a small single-choice set such as:

- Recommended / Latest

Use neutral pills for larger filter sets.

Selected filter:

- system blue text
- very subtle blue tint

Do not use yellow, green, purple, or blue category backgrounds.

## 9. Lists and cards

Use the component that matches the browsing task.

- AI/news/discovery timelines: Ionic `ion-list` + `ion-item`
- contests/support opportunities: Ionic `ion-card` in a three-column desktop grid
- cards are **browse cards**, not miniature detail pages
- card hierarchy: icon/category + D-day → title → short summary → up to three tags → deadline footer
- reward, participation requirements, eligibility detail, discovery date, and long metadata stay on the detail page
- cards should be ordinary contained cards, not full-width horizontal card-news strips
- desktop card grid: 3 columns
- tablet card grid: 2 columns
- compact card grid: 1 column

A list surface:

- uses one rounded grouped container
- contains multiple rows
- separates rows with thin inset separators
- uses consistent title/description/metadata alignment
- uses neutral icons or thumbnails
- applies a neutral pressed/hover state

Home feed, category lists, discovery lists, and archive should all follow this grammar.

## 10. Home feed

Each row contains:

1. rank/order
2. icon
3. title
4. one-line description
5. metadata
6. compact status on wide layouts

No category-colored backgrounds.

The right-side status should remain secondary to the title.

## 11. Detail views

Detail pages keep the same global shell.

Inside the content pane:

- large navigation title
- blue primary action
- neutral secondary action
- content divided into inset grouped sections
- key/value rows use subtle separators
- no decorative card colors
- no separate dashboard-like facts panel unless the content genuinely needs it

## 12. Inspector / right context pane

On wide screens the trailing pane provides secondary context:

- deadlines
- new items
- trending topics
- recent updates

Each block is an inset grouped section.

Hide the inspector at medium widths before reducing primary content legibility.

Do not show the inspector below primary content on iPhone. Compact layout uses the tab-bar/single-pane model instead.

## 13. Icons

Use **Ionicons**, which ships with Ionic, for application navigation and controls.

- use outline variants for ordinary navigation
- let icons inherit label/selection color
- keep stroke weight consistent
- do not use multicolor emoji as navigation chrome
- do not maintain custom SVG-mask copies of common icons

Do not redistribute SF Symbols assets or Apple font files.

## 14. Touch and interaction

Compact layouts:

- primary navigation targets: at least about 44px
- bottom tab items: 54px or larger
- pressed state: subtle neutral fill or reduced opacity
- avoid tiny text-only click targets

Honor `prefers-reduced-motion`.

## 15. Color scheme

Use a light-only interface for this product unless a concrete product requirement for dark mode appears later.

Do not add automatic dark mode just because Apple platforms support it.

## 16. Review gate

Before merging UI changes:

1. render home, category, discovery, archive, and detail routes
2. validate 1440px, tablet-width, and 390px layouts
3. verify wide = 3-pane, medium = 2-pane, compact = 1-pane + tab bar
4. verify no horizontal overflow
5. verify no console/page errors
6. verify no duplicate IDs
7. verify mobile targets are usable
8. verify the Ionic searchbar and Ionic segment emit the expected events
9. verify mobile navigation is a real `ion-tab-bar`
10. verify grouped routes render real `ion-list` / `ion-item` elements
11. verify no large yellow/blue/green semantic category backgrounds remain
12. verify the light color scheme remains coherent and readable
13. verify custom CSS does not redraw standard Ionic controls
