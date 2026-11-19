// Classes for the create/edit form, shared by ApplicationForm and its
// skeleton, so their boxes match by construction (SPEC.md decision log,
// 2026-11-19). A plain module, not the "use client" ApplicationForm file: a
// Server Component importing a constant from a client module gets a client
// reference, not the string.
export const formCardClass =
  "flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:p-6";
export const requiredNoteClass = "text-sm text-muted";
export const pairGridClass = "grid gap-5 sm:grid-cols-2";
export const fieldClass = "flex min-w-0 flex-col gap-1";
export const labelClass = "text-sm font-medium";
export const requiredMarkClass = "text-muted";
export const controlClass = "field w-full min-w-0 px-3 py-2 text-sm";
export const hintClass = "text-xs text-muted";
export const fieldsetClass = "flex flex-col gap-2";
export const legendClass = "mb-2 font-display text-sm font-semibold";
export const salaryGridClass = "grid gap-5 sm:grid-cols-3";
export const actionsClass = "flex flex-wrap items-center gap-3";
