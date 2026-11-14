# Design brief

The input for the `frontend-design` skill and the yardstick for reviewing UI
work (the `ui-reviewer` subagent in week 8). `SPEC.md` stays the source of
truth for behavior; this file covers only how the app looks.

## Audience

- **Me, during a job search.** The first 10 seconds should feel like _light
  effort_: not another spreadsheet I have to fill in.
- **Employers reviewing a portfolio.** The first 10 seconds should say: a
  modern app made by an experienced frontend developer with good taste.
  Concretely, _crafted_ (careful spacing, typography and states: empty,
  error, loading, the details that usually get skipped) and _distinctive_
  (clearly not a Tailwind or shadcn template).

## Mood

- Is: **clean, focused, confident**
- Is not: **generic, busy**

"Clean" is the easy part and the risk: clean without a point of view reads as
a template. The design has to earn "distinctive" through a few deliberate
details (type, the status pattern, controls), not through decoration.

## How a direction is judged

A candidate direction is shown as a visual artifact on the real list screen
(header, filter form, list, empty state) at 1280px and 360px, light and dark.
It passes only if:

1. It matches the mood and both audiences above.
2. It meets every constraint below, including the contrast of control
   boundaries and states, with ratios computed from its tokens.
3. Status can be scanned in under a few seconds without reading every row.
4. Buttons, checkboxes and links read as controls at first glance and don't
   look like default shadcn or Material components.
5. The dark theme looks designed, not inverted.

## Direction: Signal (chosen 2026-11-14)

Status is the colour. Colour is spent on one thing only, where each
application stands; everything else is neutral grey and one ink.

- **Status edge:** every list row (and later every kanban card) carries a
  6px edge in its status colour. The text badge stays. The Offer row is also
  tinted, so Offer is the strongest signal on the page. Rejected is grey
  everywhere.
- **Filter as legend:** each status checkbox shows its colour (a stripe
  inside the box, filled when checked) and a count. The counts and the
  pipeline bar above the list are specified in US-6 (`SPEC.md`).
- **Logo:** five bars in the five status colours, next to "Job Tracker".
- **Archived:** an outlined "Archived" badge, the company name muted.
- **Type:** Archivo (variable width; expanded, about 118%, for headings,
  the logo and legends) and Martian Mono for dates, counts and the email.
- **Layout:** the page is up to 1120px wide; from 1024px the filter is a
  sticky 14rem column left of the list.
- **Buttons:** ink face with a darker bottom lip that presses down. In the
  light theme lip and face are close (1.29:1), so a 1px hairline in the page
  background separates them; both sit outside the button's box, so the label
  is centred on the face.
- **Checkboxes:** native inputs styled with `appearance: none`, not hidden
  inputs with a drawn box.

Status colours (edge / badge background / badge text):

| Status    | Light                         | Dark                          |
| --------- | ----------------------------- | ----------------------------- |
| Wishlist  | `#7A4FE0` `#F0EAFD` `#5A2DB8` | `#A88BFA` `#2A2148` `#D3C4FD` |
| Applied   | `#2A6FD6` `#E5EEFC` `#1C4F9C` | `#5C9CF5` `#172A4B` `#ADCBFA` |
| Interview | `#B46800` `#FCEFD7` `#7E4800` | `#EDA634` `#3A2A0D` `#F5C56C` |
| Offer     | `#0B8A4E` `#0B7A45` `#FFFFFF` | `#3CD383` `#3CD383` `#052916` |
| Rejected  | `#848C9A` `#EEF0F3` `#515A68` | `#6A7585` `#222B37` `#AAB4C2` |

Neutrals: background `#EDF0F4` / `#0C1118`, surface `#FFFFFF` / `#141B25`,
line `#DCE1E8` / `#263141`, text `#0E1621` / `#E6EBF2`, muted `#4D5969` /
`#9DA9BA`, control border `#6F7A8B` / `#6E7A8D`, ink `#1B2533` / `#E6EBF2`.

Risk to watch: with 40 rows it can get busy. Colour stays on the edge and
the badge, never on whole rows except Offer.

## Candidates and decisions so far

- **Signal:** chosen, see above.
- **Paper** (torn edges, grain, tape, layered sheets): not chosen. It was
  liked for its depth and for not looking like a template, but the mood moved
  to "clean, focused, confident", and its buttons and the logic of the
  layered sheets were never resolved.
- **Status edge** (from `e7c1286739beff7bf7d51b4546e253ab.jpg`): kept as a
  pattern for any direction, not as a style. Each list row or kanban card
  carries its status colour on one edge; the text badge stays.
- **Rejected:**
  - Neumorphism: control boundaries are soft shadows on the same colour, so
    they fail non-text contrast (WCAG 1.4.11, 3:1) and pressed states are
    hard to tell apart; the depth disappears in dark mode; extruded rows add
    noise to dense data; it reads as a dated trend.
  - The infographic style as a whole: stock-template look, the zigzag offset
    breaks scanning and doesn't fit 360px.
  - Paper collage colour blocks and a kraft (wood-like) board background.

## Screens

- **Header:** logo (a mark, with or without the name "Job Tracker"), auth
  links when signed out, the user's email and sign-out when signed in.
  Below 640px the email and sign-out move into an account menu (a circle with
  the email's initial); from 640px they're inline.
- **Application list** with the filter form: "Status" and "Archive"
  fieldsets with checkboxes, a "Clear" link and an "Apply" button; a sticky
  column left of the list from 1024px, above the list below it; an
  "Archived" badge on archived rows.
- **Detail page, forms, sign-in and sign-up:** restyled before M5.
- **Kanban (M5)** and the **landing page** (week 8, needs a `SPEC.md` story
  first): the direction must have an answer for both.

## Status badges

Every status is a badge: colour **and** text, never colour alone. WCAG AA
contrast for the text in both themes. Offer is the strongest accent;
Rejected is muted, not alarm red. Wishlist, Applied and Interview are
distinct from each other at a glance.

## Typography

A sans with character for headings and UI text; a monospace for dates,
numbers and small labels if the direction benefits from it. Loaded with
`next/font`.

## Illustrations

AI-generated image assets, made when the landing page is built in week 8.
Until then the direction must work without them.

## Constraints

- Responsive from 360px; no horizontal scroll
- WCAG AA in both themes: text contrast, plus 3:1 for the boundaries and
  states of controls (buttons, inputs, checkboxes); visible keyboard focus
- Light and dark follow the system preference only; no theme toggle
- Tailwind only, no component libraries; textures and illustrations are
  image or SVG assets
- Colours, fonts, radii and shadows come from design tokens in `@theme`,
  never raw values in components
- No texture or decoration under text; data sits on a flat surface
- Decoration must not cause layout shift or slow the first paint noticeably

## Out of scope

- Motion (view transitions, micro-interactions, scroll animations): end of
  week 5, after the kanban works
- The landing page build and its video: week 8
