---
name: frontend-design
description: "Visual design rules for this project's UI (Signal direction, design tokens, status colours, button and checkbox utilities, focus and contrast, the screenshot done check). Use when styling or restyling UI, building a new screen or component, changing Tailwind classes or className, editing src/app/globals.css, or changing layout, colours, typography, focus/hover/pressed states, or empty/loading states. Not for Server Actions, queries, schemas, or tests that don't touch markup."
user-invocable: false
---

# Frontend design

Reference components: `application-list.tsx` and `status-filter-form.tsx` in `src/features/applications/components/`.

## Sources of truth

- `docs/design-brief.md`: the direction (Signal), mood, constraints and what's out of scope (motion until the end of week 5). Read it before a new screen; don't restate it in code comments.
- `src/app/globals.css`: tokens in `@theme`, dark overrides under `prefers-color-scheme`, utilities.
- Components use token utilities only (`bg-surface`, `text-muted`, `border-control`, …): no raw colours, fonts, radii or shadows, no arbitrary `[#…]` values. A missing value becomes a new token, light and dark, first.
- No `dark:` classes: the tokens switch themes.
- Screens still on zinc + `dark:`: when the task restyles that component, move it fully to tokens; when the task isn't about styling, leave its classes alone (no unrelated refactors).

## Status colour

- Colour is spent on status only; everything else is neutral and ink.
- Status classes come only from `STATUS_STYLES` in `src/features/applications/status-style.ts` (static strings, so Tailwind sees them). A new status surface (kanban card, …) gets a key there.
- Never colour alone: the badge always carries the label.

## Utilities (`globals.css`)

- `button-ink`: the one primary action in a region (Apply, Add). Size it with padding and text size only.
- `button-quiet`: secondary actions and header links (Sign in, Sign out).
- `check`: every checkbox. Colour it with `text-<status>` from `STATUS_STYLES`, or `text-ink [--check-stripe:transparent]` for a box that isn't a status.
- `font-display`: expanded width for headings, the logo and legends; not for body text.
- A new reusable control becomes a new `@utility` there, not a repeated class string.

## Lessons from the spike

- Status edges sit on `bg-surface`, not `bg-bg`: Rejected's grey edge reaches 3:1 only on surface.
- Inside `overflow-hidden` (the list card), focus outlines are inset (`-outline-offset-2`), or the container clips them.
- `button-ink` draws a 4px lip and a 5px-offset focus ring outside its box: leave room below and around it (padding on the parent, no tight `overflow-hidden`), or both get clipped.
- Custom controls need a `forced-colors: active` fallback, since box-shadows and backgrounds are dropped there (see the transparent border on `button-ink`, `appearance: auto` on `check`).
- Every new token pair (text on its background, a control boundary on its background, the focus ring) gets a contrast ratio computed in both themes: 4.5:1 for text, 3:1 for non-text. Write the ratio in the token's comment in `globals.css`.
- Skeletons match the real box model, so nothing shifts when data arrives: static labels are the real words with the real classes, `text-transparent` on the pulse background (inside `aria-hidden`, with `forced-color-adjust-none`), so the font sets their width; fixed sizes only for dynamic text. Text locators (`getByText`, `hasText`) can match those words while the fallback is on screen: scope them to `main` content that isn't the skeleton, or use `getByRole`.

## Done check

Screenshots come from the production build on the e2e database, signed in as a fresh user, the way the e2e skill does it (no dev indicator, the real PPR shell). After the last change:

1. Write a spec in the scratchpad: `signUpFreshUser(page)` from `e2e/fresh-user.ts`, create the data the screen needs through the UI, wait for a visible result (no `aria-busy`), then for each changed screen `page.setViewportSize` to 360×800 and 1280×800 and, for each of `light` and `dark`, `page.emulateMedia({ colorScheme })` and `page.screenshot` to the scratchpad. Add one shot per new control focused with `page.keyboard.press("Tab")`, and at 360 log `document.documentElement.scrollWidth` (must equal 360).
2. Playwright only loads specs from `testDir` (`e2e/`): copy it to `e2e/zz-shots.spec.ts` with repo-relative imports (`@playwright/test`, `./fresh-user`), run `npx playwright test zz-shots`, then delete the copy and check `git status` shows nothing in `e2e/`. Never run it alongside `npm run test:db`.
3. Forced colors: `page.emulateMedia({ forcedColors: "active" })` in Chromium only switches the `@media (forced-colors)` rules; backgrounds, fills and colours stay, so it doesn't show the real forced palette. Use it to check the fallback rules, and check new controls once by hand in a Windows contrast theme (Settings → Accessibility → Contrast themes).
4. Look at every screenshot before calling it done; then `npm run lint && npm run typecheck && npm test`.
