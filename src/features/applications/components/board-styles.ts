// Shared by the board (a Client Component) and its skeleton (a Server
// Component), so both lay out the same boxes. A plain module: string
// constants imported from a "use client" file would reach a Server Component
// as client references, not strings.

// The message line keeps its height when empty, so the columns don't move
// when a message appears, and the skeleton reserves the same line.
export const messageClass = "mb-3 min-h-5 text-sm";

// Below `md` one column per container width, snapping; from `md` the columns
// share the width with a 13rem minimum (five fit the 1120px page) and the
// container scrolls when they don't fit. The page itself never scrolls.
export const boardClass =
  "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 md:snap-none";
export const columnClass =
  "flex w-full shrink-0 snap-start flex-col gap-2 rounded-lg border border-line p-2 md:w-auto md:min-w-52 md:flex-1";
export const headingClass =
  "px-1 py-0.5 font-display text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
export const countClass = "font-mono text-xs font-normal text-muted";
export const cardListClass = "flex flex-col gap-2";
