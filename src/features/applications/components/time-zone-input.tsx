"use client";

import { useSyncExternalStore } from "react";

// The browser's IANA time zone, sent with the filter form as `tz` (US-6, SPEC.md
// decision log, 2026-11-17). The server can't know it, so the server render and
// hydration use "" (the server snapshot) and React then re-renders with the
// browser's zone: no hydration mismatch. A submit before hydration sends an
// empty `tz`, which the server reads as UTC. The zone doesn't change while the
// page is open, so there is nothing to subscribe to.
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "";

export function TimeZoneInput() {
  const zone = useSyncExternalStore(subscribe, browserZone, serverZone);
  return <input type="hidden" name="tz" value={zone} />;
}
