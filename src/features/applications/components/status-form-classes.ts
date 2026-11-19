// Classes for the detail page's status form, shared by StatusForm and the
// detail skeleton. A plain module, not the "use client" StatusForm file: a
// Server Component importing a constant from a client module gets a client
// reference, not the string.

// p-4 leaves room for the button's lip and 7px focus ring.
export const statusFormClass =
  "flex flex-col gap-1 rounded-lg border border-line bg-surface p-4";
export const statusLabelClass = "text-sm font-medium";
// items-start and h-10.5 (42px): the select spans the button's face (38px)
// plus its 4px lip, so both look the same height.
export const statusRowClass = "flex flex-wrap items-start gap-3";
export const statusSelectClass =
  "field h-10.5 min-w-0 px-3 py-2.5 text-sm font-medium";
