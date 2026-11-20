import { ViewTransition, type ReactNode } from "react";

// A page's view transition (SPEC section 7). The classes are styled in
// globals.css. default="none": an update inside the page (a board move, a
// filter navigation, a refresh, a skeleton swapping for its content) starts
// no transition, because clicks are lost while one runs.

const NONE = "none";

// Wraps a page's content: it slides when the navigation carries a direction
// (the Link's transitionTypes). Without one, `/` and `/board` crossfade
// (`untyped="crossfade"`) and the other pages don't animate. Put it in each
// page.tsx, not a layout: layouts persist, so they never enter or exit.
export function PageTransition({
  children,
  untyped = NONE,
}: {
  children: ReactNode;
  untyped?: "crossfade" | typeof NONE;
}) {
  const classes = {
    "nav-forward": "nav-forward",
    "nav-back": "nav-back",
    default: untyped,
  };
  return (
    <ViewTransition enter={classes} exit={classes} default={NONE}>
      {children}
    </ViewTransition>
  );
}
