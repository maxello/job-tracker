// Classes for the US-6 search field, shared by SearchField and the list
// skeleton, so their boxes match by construction. A plain module, not the
// "use client" SearchField file: a Server Component importing a constant
// from a client module gets a client reference, not the string.

// The legend style (small, uppercase, bold, expanded, letter-spaced), shared
// by the fieldset legends and the "Search" label (SPEC.md decision log,
// 2026-11-18).
export const legendClass =
  "block pb-2.5 font-display text-xs leading-none font-bold tracking-legend uppercase";

// The visible label is uppercase through CSS, and Chromium applies
// text-transform to the accessible name ("SEARCH"), so the input also gets
// aria-label in normal case; one constant feeds both, so they can't drift
// (SPEC.md decision log, 2026-11-18).
export const SEARCH_LABEL = "Search";

// The wrapper spans the whole row below `lg`.
export const searchFieldClass = "flex basis-full flex-col gap-1";
export const searchLabelClass = "flex flex-col";
export const searchInputClass = "field w-full min-w-0 px-3 py-1.5 text-sm";
export const searchHintClass = "text-xs text-muted";
