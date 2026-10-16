---
name: Gifty
description: A self-hosted gift planner. Calm teal working surfaces under a slate header, where the list of people and dates is the point.
colors:
  primary: "#006666"
  primary-strong: "#004c4c"
  primary-bright: "#008080"
  primary-wash: "#eaf7fa"
  on-fill: "#ffffff"
  chrome: "#334155"
  on-chrome: "#ffffff"
  surface: "#ffffff"
  surface-muted: "#f8f9fa"
  ink: "#333333"
  ink-muted: "#666666"
  border: "#e0e0e0"
  border-input: "#888888"
  success: "#2e7d32"
  success-wash: "#e8f5e9"
  warning: "#856404"
  warning-wash: "#fff3cd"
  danger: "#dc3545"
  danger-strong: "#c82333"
  danger-wash: "#ffebee"
  info: "#4682b4"
  info-ink: "#36648b"
  info-wash: "#f0f9ff"
  scrim: "rgba(0, 0, 0, 0.5)"
  data-1: "#2a78d6"
  data-2: "#eb6834"
  data-3: "#1baf7a"
  data-4: "#eda100"
  data-5: "#e87ba4"
  data-6: "#6250d6"
typography:
  display:
    fontFamily: "Quicksand, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  headline:
    fontFamily: "Quicksand, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Quicksand, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  button:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  page-title:
    textColor: "{colors.primary}"
    typography: "{typography.display}"
  header:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.on-chrome}"
    height: "56px"
    padding: "8px 20px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-fill}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary-strong}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.danger-strong}"
    textColor: "{colors.on-fill}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary-strong}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "32px"
    width: "560px"
  modal-title:
    textColor: "{colors.primary}"
    typography: "{typography.headline}"
  field-label:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  field-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  field-help:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
  field-error:
    textColor: "{colors.danger-strong}"
    typography: "{typography.body-sm}"
---

# Design System: Gifty

## Overview

**Creative North Star: "The Gift Ledger"**

Gifty is a working tool, not a showroom. People open it to check who has a birthday coming up, what they already bought, and how much budget is left. The interface should feel like a well-kept ledger: calm, legible, one confident teal used for the things you can act on, and everything else quiet. Brand lives in the details (the teal, the rounded Quicksand titles, the soft teal wash behind every page), not in decoration.

This file records the world the authenticated app already has, then consolidates it. The theming audit (2026-10-15) counted 212 distinct hex colors, 49 font sizes, 108 box-shadows and 19 radii across 46 CSS files. Most of that is drift: the same job done with four teals, five reds and three gray ramps borrowed from Bootstrap, Flat UI and Tailwind. Every canonical value below was picked from the values the app already uses most (usage counts in parentheses are literal occurrences in the CSS; the audit's normalized counts, which merge #666 with #666666, run a few higher), and changed only where the incumbent fails WCAG AA. Nothing here is a redesign.

The app is in **Operate** mode everywhere except the public landing page. Scanability, consistency between pages and predictable controls outrank expression. The landing page (`/`) and the login and register pages currently use their own palette (coral #f74949, a red-purple-navy gradient, pink #e6739f, a Playfair serif that never loads). They are off-world and **move into the teal world** described here: same tokens, same buttons, same type.

**Key Characteristics:**
- One brand teal (#006666, 274 uses) carries every primary action, page title and selected state.
- A slate header (#334155) is the only dark surface; pages sit on a pale teal-to-gray wash with white cards.
- Rounded but not bubbly: 8px controls, 12px cards and dialogs, pills only for chips and avatars.
- Quicksand (the one webfont actually loaded) for titles and the wordmark; the system sans for everything you read.
- Soft, low shadows; depth comes mostly from white cards on a tinted page.
- Every color token has a dark-theme counterpart, so the Theme setting can become real.

## Colors

A single deep teal on cool, near-white neutrals, with a slate header and conventional semantic colors for status.

### Primary
- **Gifty Teal** (`primary`, #006666, 274 uses): primary buttons, page titles, links, selected and active states, focus rings. 6.79:1 on white, 6.20:1 on the page wash: safe for text at any size.
- **Deep Teal** (`primary-strong`, #004c4c, 17 uses): hover and pressed state of primary buttons (already the hover on both `Gifts .generateButton` and `Settings .primaryButton`); text on the teal wash when extra weight is needed.
- **Bright Teal** (`primary-bright`, #008080, 52 uses): fills, icons, large text and progress bars only. 4.77:1 on white passes AA but with no margin, so never use it for body-size links or labels. It replaces the decorative `#006666 → #008080` gradients (12 uses), which should become solid `primary`.
- **Teal Wash** (`primary-wash`, #eaf7fa, 26 uses): the start of the page background gradient, selected rows, ghost and secondary button hover, info-like teal callouts.
- **On Fill** (`on-fill`, #ffffff): text and icons on any filled button (primary, danger).

Retire into `primary` / `primary-strong`: #005555 (19), #007b7f (15), #0891b2 and #0e7490 (Events cyan gradient), #2a9d8f, #0d9488 (Tailwind teal-600 on /recipients), #10b981, #059669.

### Secondary
- **Slate Chrome** (`chrome`, #334155, 29 uses + the slate text family): the fixed header and its dropdown menu. Nothing else is slate-filled.
- **On Chrome** (`on-chrome`, #ffffff): header icons and wordmark. 10.35:1 on slate.

### Neutral
- **Card White** (`surface`, #ffffff): cards, dialogs, inputs.
- **Mist** (`surface-muted`, #f8f9fa, 75 uses): the end of the page gradient, recessed wells inside cards, table stripes, disabled field fill.
- **Ink** (`ink`, #333333, 29 uses): body text and headings that are not teal. 12.63:1 on white, 11.54:1 on the wash.
- **Muted Ink** (`ink-muted`, #666666, 39 uses): secondary text, help text, metadata, **and placeholders**. 5.74:1 on white, 5.25:1 on the wash. This is the lightest gray allowed for any text.
- **Hairline** (`border`, #e0e0e0, 74 uses): card borders, dividers, table rules. Decorative only (1.32:1).
- **Field Edge** (`border-input`, #888888, 4 uses): input, select and checkbox outlines, so the control boundary meets 3:1 against white (3.54:1). The audit flagged #888 as failing **as text**; as a border it is the right weight.
- **Scrim** (`scrim`, rgba(0,0,0,0.5)): the backdrop behind every dialog.

Retire into `ink` / `ink-muted`: #555, #444, #495057, #6c757d, #7f8c8d, #95a5a6, #4a5568, #2c3e50, #64748b, #475569, #111827, #0f172a. Retire for text entirely: #888 (3.54:1 per the audit), #999, #a0a0a0 (the audit measured 2.29:1 on #f0f0f0 in the read-only /user-profile fields; 2.61:1 on white; it fails either way). Retire into `border`: #ddd, #f0f0f0, #e2e8f0, #dee2e6, #e9ecef, #ccc, #e0e8ef.

### Semantic
Each status has a solid color (icons, borders, fills, text on white) and a wash (alert or badge background). Text on a wash uses the solid color, except danger, which uses `danger-strong`.

- **Success** (`success`, #2e7d32; wash `success-wash` #e8f5e9): saved, purchased, healthy. The most-used green, #2ecc71 (8), is 2.0:1 and #28a745 (6) is 3.13:1; both fail as text, so the canonical is the app's own #2e7d32 (5.13:1 on white, 4.56:1 on its wash). White on #2e7d32 is 5.13:1 if it is ever a fill.
- **Warning** (`warning`, #856404; wash `warning-wash` #fff3cd): the existing Bootstrap pairing (7 and 4 uses). 4.96:1 on its wash. #ffc107 / #ff9800 survive only as icon fills on a dark-text badge.
- **Danger** (`danger`, #dc3545, 34 uses; `danger-strong` #c82333; wash `danger-wash` #ffebee, 8 uses): delete, errors, overdue. White on #dc3545 is 4.53:1 (fill OK). #dc3545 on its wash is 3.96:1 and fails, so error text and text on the danger wash use `danger-strong` (4.91:1 on wash, 5.61:1 on white), which is also the danger hover. Retire #e74c3c, #f44336, #ff4444, #dc2626, #ff4136, #cc0000, #c62828, #b42318.
- **Info** (`info`, #4682b4, 44 uses; `info-ink` #36648b; wash `info-wash` #f0f9ff): neutral notices, non-holiday event markers, the header's bottom edge and the avatar ring. Steelblue is 4.11:1 on white, fine for icons, borders and stripes (≥3:1) but not text, and no darker blue in the app is a usable info text color (#2c3e50 reads as navy ink, #0e7490 as teal). `info-ink` (#36648b, 6.26:1 on white, 5.88:1 on its wash) is the one **derived** value in this palette. Steelblue is never a button color: About and Notifications save buttons move to `primary`.

### Data
Charts use six categorical colors in a fixed order (`data-1` … `data-6`: blue #2a78d6, orange #eb6834, aqua #1baf7a, yellow #eda100, magenta #e87ba4, violet #6250d6; dark: #3987e5, #d95926, #199e70, #c98500, #d55181, #9085e9). They are taken from the validated dataviz reference palette (adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19 in both themes; checked against `surface` #ffffff and #1e293b). The teal is left out on purpose: next to it the blue fails the normal-vision floor, and teal stays the action color. A seventh category folds into "Other" in `ink-muted`; colors are never cycled. Three light slots sit under 3:1 on white, so every chart carries a legend and an accessible value list. Data colors are never text; chart text uses `ink` / `ink-muted`, grid lines `border`, tooltips `surface`. A sentiment scale (very negative → very positive) is diverging, not categorical: `danger`, `warning`, `ink-muted`, `primary-bright`, `success`.

### Dark theme
Every token has a dark counterpart. Dark mode is a slate world (the header's family) with the teal lifted to stay readable; the light teals fail on dark surfaces (#006666 is 2.15:1 and #008080 3.06:1 on #1e293b). Ratios are against the dark `surface` (#1e293b) unless noted. Values marked *derived* do not exist in the code yet.

| Token | Light | Dark | Check |
|---|---|---|---|
| primary | #006666 | #7cccc8 | 7.89:1 text on surface |
| primary-strong | #004c4c | #b4e0e0 | 10.23:1 |
| primary-bright | #008080 | #2a9d8f | 4.40:1, fills and large text only |
| primary-wash | #eaf7fa | #134e4a *derived* | dark ink 7.69:1, dark primary 5.11:1 on it |
| on-fill | #ffffff | #0f172a | 9.63:1 on dark primary, 8.30:1 on dark danger |
| chrome | #334155 | #020617 *derived* | dark ink 16.36:1 |
| on-chrome | #ffffff | #e2e8f0 | 16.36:1 |
| surface | #ffffff | #1e293b *derived* | |
| surface-muted | #f8f9fa | #0f172a | page background in dark; dark ink-muted 6.96:1 |
| ink | #333333 | #e2e8f0 | 11.87:1 |
| ink-muted | #666666 | #94a3b8 | 5.71:1 (6.96:1 on surface-muted) |
| border | #e0e0e0 | #334155 | decorative |
| border-input | #888888 | #64748b | 3.07:1 control edge |
| success | #2e7d32 | #a5d6a7 | 8.90:1; 8.68:1 on its wash |
| success-wash | #e8f5e9 | #14301f *derived* | |
| warning | #856404 | #fcd34d | 10.15:1; 9.23:1 on its wash |
| warning-wash | #fff3cd | #3a2e0f *derived* | |
| danger | #dc3545 | #ef9a9a | 6.80:1; 7.05:1 on its wash |
| danger-strong | #c82333 | #ffcdd2 | hover / text on wash, 10.77:1 on its wash |
| danger-wash | #ffebee | #3b1d22 *derived* | |
| info | #4682b4 | #4682b4 | 3.56:1, non-text only |
| info-ink | #36648b | #a8c6df | 8.23:1; 7.75:1 on its wash |
| info-wash | #f0f9ff | #1c2e44 *derived* | |
| scrim | rgba(0,0,0,0.5) | rgba(0,0,0,0.7) | |
| data-1 | #2a78d6 | #3987e5 | ≥3:1 on dark surface |
| data-2 | #eb6834 | #d95926 | ≥3:1 on dark surface |
| data-3 | #1baf7a | #199e70 | ≥3:1 on dark surface |
| data-4 | #eda100 | #c98500 | ≥3:1 on dark surface |
| data-5 | #e87ba4 | #d55181 | ≥3:1 on dark surface |
| data-6 | #6250d6 | #9085e9 | ≥3:1 on dark surface |

In dark mode the page background is flat `surface-muted` (no gradient), and filled buttons switch to dark text (`on-fill` #0f172a) on the light teal.

### Named Rules
**The One Teal Rule.** Every interactive or selected thing is `primary`. A new screen does not introduce a second brand hue, a cyan, a steelblue button or a teal gradient.

**The Muted Floor Rule.** No text, including placeholders, is lighter than `ink-muted` (#666666) on light surfaces or `ink-muted` dark (#94a3b8) on dark ones.

**The Status Is Not Decoration Rule.** Success, warning, danger and info appear only when they mean that status. The header's rainbow icon hovers (orange, dodger blue, tomato, lime, gold) are decoration and go.

## Typography

**Display Font:** Quicksand (with system-ui, Segoe UI, Roboto, Arial fallback)
**Body Font:** the system sans stack (system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif)

**Character:** Quicksand's rounded geometry is the friendly voice of the wordmark and page titles; the system sans does the reading at small sizes, where Quicksand's thin strokes lose legibility.

Quicksand is the only webfont that actually loads (weights 500 and 700, injected by `Header.js` from Google Fonts). It will be self-hosted in a later stage, because the app ships with a CSP and must not depend on a third-party origin; no other webfont is added. Inter (Events), Montserrat (landing) and Playfair Display (landing) are declared but never load and are removed. The twelve per-module `font-family: Arial` declarations collapse into one declaration on `body`.

### Hierarchy
Six sizes on a roughly 1.2 ratio, all in rem (12 / 14 / 16 / 20 / 24 / 32 px).

- **Display** (Quicksand 700, 2rem, 1.25): the page title, once per page. 32px is already the most common computed h1 (4 of 11 routes) and 2rem has 11 uses. Replaces 30, 36, 40, 44.8 and 24px titles.
- **Headline** (Quicksand 700, 1.5rem, 1.3): section and card headings, dialog titles. 24px + 1.5rem + 1.5em = 38 uses. Absorbs 1.75rem and the 1.8em card titles.
- **Title** (Quicksand 700, 1.25rem, 1.35): sub-section headings, gift and event card names. The 1.2em / 1.2rem / 1.25rem / 20px cluster (41 uses).
- **Body** (400, 1rem, 1.5): paragraphs, table cells, input text. 1rem + 16px = 56 uses. Keep running text to 65–75ch.
- **Body small** (400, 0.875rem, 1.45): help text, metadata, dense lists. Collapses 0.9rem (57, the single most common size), 0.85rem (23), 0.95rem (16), 14px (33), 15px and the em variants onto 0.875rem.
- **Label** (600, 0.875rem, 1.4): form labels, table headers, chip text.
- **Button** (600, 1rem, 1.25): button text, sentence case.
- **Caption** (400, 0.75rem, 1.4): timestamps, badge counts, legal footnotes. Absorbs 0.7rem / 0.8rem / 12px / 10px; nothing goes below 0.75rem.

In code each heading role is one `font` value: `--type-display`, `--type-headline`, `--type-title` (`font: var(--type-display)` in a module; `.type-display` / `.type-headline` / `.type-title` classes for Tailwind markup). `h1`, `h2` and `h3` default to Display, Headline and Title in `index.css`, so a module only sets a role where element and role differ. Text that changes weight (a read notification title) stays in the body family. Running text is capped at `--measure` (70ch). Figures that are compared (stat values, amounts, prices, money columns) use `font-variant-numeric: tabular-nums`. Uppercase is for short badges only (the "DELETE" confirm field, day counters), never for labels or headings.

Quicksand is self-hosted at 700 only, so headings use 700 (the incumbent 600 on card h2s silently synthesizes). Use `em` for nothing: sizes compound inside nested components.

### Named Rules
**The One Title Rule.** Every page opens with exactly one Display title: Quicksand 700, 2rem, `primary`, left-aligned at the start of the content column. No gradient text, no centering, no icon-in-title variants.

**The No Gradient Text Rule.** All eight `background-clip: text` headings (including the muddy header wordmark) become solid color. Emphasis comes from size and weight.

## Layout

Pages sit under a fixed 56px header (`3.5rem`) and center a content column of max 1200px (13 uses of `max-width: 1200px`) with 20px side padding (16px below 480px). The page background is `linear-gradient(135deg, primary-wash 0%, surface-muted 100%)`, already used on 14 pages; it is the only page background.

**Page frame:** every page root takes `padding: var(--page-padding)` (`--page-pad-top` 40px, 24px under 768px; `--page-pad-x` 20px, 16px under 480px; `--page-pad-bottom` 40px, 32px under 768px) and centers its column with `max-width: var(--content-max)`; `.page-frame` is the same for Tailwind markup. Pages do not paint their own background or set `min-height: 100vh`: `.main-content` carries the page background and the full height, so the export banner and the page share one surface. The title is the first thing in the column, outside any card; page actions sit on its row.

**Spacing scale (4px grid):** xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24 / 3xl 32 / 4xl 40px. The app mixes a 5px grid (5 / 10 / 15 / 25 / 30 / 35) with a 4px one. 20px is the single most common spacing value (209 uses) and fits both, so the 4px grid wins: 5 → 4, 10 → 8 (gaps) or 12 (control padding), 15 → 16, 25 → 24, 30 → 32, 35 → 32 or 40.

**Rhythm:** 8px inside a group (label to input, icon to text), 16px between fields, 24px card padding and grid gap, 32px between page sections, 40px above the page title block. More space above a heading than below it.

**Breakpoints:** 480px (phone), 768px (tablet; already the dominant query, 23 uses), 1024px (desktop). Drop the stray 576 / 600 / 900 / 992px queries into the nearest of these. Card grids use `repeat(auto-fill, minmax(300px, 1fr))` and fall to one column under 768px. Touch targets are at least 44px tall.

## Elevation & Depth

Hybrid, mostly tonal. Depth comes first from white cards sitting on the tinted page; shadows are soft, low and always offset downward. There are three levels and one focus ring, all carried in the sidecar (`.impeccable/design.json`).

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05)`, 28 uses, the most common shadow): cards and panels at rest.
- **Raised** (`box-shadow: 0 4px 12px rgba(0, 102, 102, 0.1)`, 17 uses): hover on clickable cards, open dropdowns, the floating add button. The teal tint is part of the brand.
- **Overlay** (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1)`, 7 uses): dialogs and popovers above the scrim.
- **Focus ring** (`outline: 2px solid` primary, `outline-offset: 2px`): every focusable control. The incumbent ring (`0 0 0 2px rgba(0, 102, 102, 0.1)`, 7 uses) is about 1.1:1 against white and effectively invisible, so it is replaced; a visible focus indicator is an accessibility requirement, not a style choice.

In dark mode the same offsets use black at 0.4 / 0.5 / 0.6 opacity, and the focus ring uses dark `primary` (#7cccc8).

### Named Rules
**The Three Shadows Rule.** A new surface uses Rest, Raised or Overlay. The other 105 shadow values in the code converge on these.

**The Calm Motion Rule.** Transitions animate `background-color`, `color`, `border-color`, `box-shadow` or `transform` over 150–200ms ease-out; never `transition: all` (over 100 uses today), and nothing moves under `prefers-reduced-motion: reduce`. Clickable cards may lift 2px on hover; nothing scales.

## Shapes

Gently rounded and consistent by size. Four radii: **sm 4px** (62 uses; checkboxes, tooltips, small tags, table cells), **md 8px** (118 uses, the most common; buttons, inputs, selects, dropdown menus), **lg 12px** (44 uses; cards, dialogs, alerts), **full 9999px** (avatars, chips, badges, the floating add button; replaces 50%, 20px and 25px pills). Mapping: 5px and 6px → md; 10px, 15px, 16px and 24px → lg.

Borders are 1px `border` on cards and dividers, 1px `border-input` on form controls. Accent stripes (`border-left` thicker than 1px) are not part of the language: status is shown with a wash background and an icon, and the existing decorative stripes go.

## Components

There is no shared component library yet: the audit counted 88 button classes and at least seven modal implementations. The conventions below name the incumbent each one is taken from; new and refactored screens use them.

### Buttons
Taken from the Settings `.button / .primaryButton / .secondaryButton / .dangerButton` triplet, the app's most complete set.
- **Shape:** gently curved (md, 8px; replaces 5px), 44px tall, 12px × 20px padding, Button type (1rem / 600), sentence case, optional 16px leading icon with an 8px gap.
- **Primary:** `primary` fill, `on-fill` text; hover `primary-strong`. One per view region. Replaces the steelblue, cyan-gradient, teal-gradient, green, pink and coral primaries.
- **Secondary:** `surface` fill, `primary` text, 1px `primary` border; hover fills `primary-wash` (not a full teal invert).
- **Danger:** `danger` fill, `on-fill` text; hover `danger-strong`. Only for the confirming action of something destructive, inside a confirmation dialog.
- **Ghost:** transparent, `primary` text, no border, 12px × 16px padding; hover `primary-wash`. For low-emphasis actions such as "Refresh Holidays" and "View All" (today a 20px-radius tinted pill on UserHome, which converges here).
- **Focus:** the focus ring on every variant. **Disabled:** `surface-muted` fill, `ink-muted` text, no hover, `cursor: not-allowed`. (#cccccc fill with white text, used on Gifts today, is 1.6:1 and goes.)

### Cards / Containers
Taken from the Gifts `.giftGenerator` / `.giftCard` pair.
- **Corner Style:** lg (12px).
- **Background:** `surface` on the page gradient; inner wells use `surface-muted`.
- **Shadow Strategy:** Rest; clickable cards go to Raised on hover with a 2px lift and a `primary` border.
- **Border:** 1px `border`.
- **Internal Padding:** 24px (2xl); 16px below 480px.
- Never nest a card inside a card; use a `surface-muted` well or a divider instead.

### Dialogs (modal)
Taken from the Settings `.modalOverlay` / `.modalContent`; the other six overlay implementations converge on it.
- `scrim` backdrop covering the viewport; panel in `surface`, lg radius, 32px padding (24px on phones), Overlay shadow, width up to 560px (wide forms may go to 720px), centered.
- Title in Headline type, `primary`. A close button (icon, 44px target, `ink-muted`, hover `primary`) top right.
- Footer right-aligned with a 12px gap and a 1px `border` top rule: the dismissive action (Secondary or Ghost) first, the main action (Primary, or Danger when destructive) last.
- Opens with focus on the first field or the safest button, traps focus, closes on Escape and on the close button, returns focus to the trigger. Destructive confirmations always use this dialog, never a toast and never `window.confirm()`.

### Inputs / Fields
Taken from the Settings `.formGroup` input.
- **Label** above the field (Label type, `ink`), 8px gap. **Input / select / textarea:** `surface` fill, 1px `border-input`, md radius, 44px tall, 12px horizontal padding, Body type (16px, which also stops iOS zoom). Placeholder `ink-muted`.
- **Focus:** border becomes `primary` plus the focus ring.
- **Help text:** Body small, `ink-muted`, 4px below. **Error:** border `danger`, message in Body small `danger-strong` with an icon, linked with `aria-describedby`.
- **Disabled:** `surface-muted` fill, `ink-muted` text.

### Page Title
One Display heading per page (see The One Title Rule), optionally followed by a Body small `ink-muted` subtitle 4px below, and page actions (Primary button) aligned right on the same row. On /gifts, /explore and /settings the title moves from centered to left; on /recipients, /events, /budgets, /purchase-history and /suggestions-help it moves out of its card or changes color and size to match.

### Navigation
- **Header:** fixed, 56px, `chrome` background, 2px `info` (steelblue) bottom edge, Quicksand 700 wordmark in solid `on-chrome`. Icon links are `on-chrome` at rest; hover and the current route show a translucent white plate (rgba(255,255,255,0.12), md radius) behind the icon, with no per-icon colors. Tooltips: `ink` background, white Body small text, sm radius.
- **Profile menu:** dropdown in `chrome`, md radius, Raised shadow.
- **Mobile (under 768px):** the hamburger reveals the same links as a vertical list in `chrome`.

### Feedback
- **Toast** (react-toastify, already mounted): results of saves, exports and background jobs. Success and error toasts use the semantic colors.
- **Inline alert:** semantic wash background, matching text color, md radius, 12px × 16px padding, leading icon, no side stripe.

## Do's and Don'ts

### Do:
- **Do** use `primary` (#006666) for every primary action, link, selected state and page title, and `primary-strong` (#004c4c) for its hover.
- **Do** put pages on the `primary-wash` → `surface-muted` gradient with white cards (lg 12px, Rest shadow, 24px padding).
- **Do** use exactly one Display page title per page, left-aligned, Quicksand 700 2rem teal.
- **Do** keep all text at `ink-muted` (#666666) or darker on light surfaces, and check ratios for every new pairing, including the dark theme.
- **Do** use rem for type and the 4px spacing scale (4 / 8 / 12 / 16 / 20 / 24 / 32 / 40) for every gap and padding.
- **Do** confirm destructive actions in the shared dialog with a Danger button; report results with a toast.
- **Do** give every focusable control the 2px `primary` focus ring.
- **Do** bring the landing, login and register pages into this palette: teal primary buttons, Quicksand titles, the page wash background.

### Don't:
- **Don't** use coral (#f74949), the red-purple-navy landing gradient, the login pink #e6739f (2.86:1 with white text) or a serif anywhere; those pages move into the teal world.
- **Don't** use steelblue (#4682b4), cyan (#0891b2), green (#2c922f) or a gradient as a button fill.
- **Don't** use gradient text, including on the wordmark.
- **Don't** use #888, #999 or #a0a0a0 for text or placeholders.
- **Don't** add a new hex value, shadow or radius when a token covers the job; add a token here first.
- **Don't** load a webfont from a third-party origin, or declare a font family that is not loaded.
- **Don't** use decorative side stripes on cards, list items or notifications.
- **Don't** use `alert()` or `window.confirm()` for app feedback.
- **Don't** animate with `transition: all`, or ignore `prefers-reduced-motion`.
