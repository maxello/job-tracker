"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ComponentProps } from "react";

export type BackLinkHandoff = "give" | "take";

// The back link that had focus when it was removed, kept for one commit only
// (cleared in a microtask).
let handedOff: HTMLAnchorElement | null = null;

// The back link's <Link>, with keyboard focus handed over when its
// <Suspense> swaps the fallback for the real link, or the not-found page
// replaces either (US-5, SPEC decision log, 2026-11-20, "back-link focus").
// On cleanup, with either value: the layout cleanup runs before React
// removes the <a>, so if the <a> has focus then, it is stored. "give" is the
// fallback. "take" (the real link, the not-found page's link) also, on
// mount, takes focus only if a node was stored in this commit, that node is
// disconnected (deleted, not hidden by <Activity>, which also runs layout
// cleanups and keeps the node), and focus is on the body. No wrapper, no
// extra attributes: the markup is the plain <Link>.
export function BackLinkAnchor({
  handoff,
  ...props
}: ComponentProps<typeof Link> & { handoff?: BackLinkHandoff }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!handoff) return;
    if (handoff === "take") {
      const previous = handedOff;
      if (
        previous &&
        !previous.isConnected &&
        document.activeElement === document.body
      ) {
        handedOff = null;
        node.focus();
      }
    }
    // Both hand over: the real link too, because on a missing id it is
    // replaced by the not-found page one commit after it took focus.
    return () => {
      if (document.activeElement !== node) return;
      handedOff = node;
      queueMicrotask(() => {
        if (handedOff === node) handedOff = null;
      });
    };
  }, [handoff]);

  return <Link ref={ref} {...props} />;
}
