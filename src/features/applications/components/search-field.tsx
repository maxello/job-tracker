"use client";

import { useId } from "react";
import { SEARCH_MAX_LENGTH } from "../search-filter";
import {
  legendClass,
  searchFieldClass,
  searchHintClass,
  searchInputClass,
  searchLabelClass,
  SEARCH_LABEL,
} from "./search-field-classes";

// US-6 search: the visible label "Search" in the legend style, and the hint
// "company or role" under the input, linked with aria-describedby (SPEC.md
// decision log, 2026-11-18). The hint sits outside the label, so it isn't
// part of the name; aria-label keeps the name "Search" in normal case. A
// client component only for useId(): the filter form is a Server Component
// with no record id to derive the hint's id from, and a server useId()
// restarts on every RSC request (#26).
export function SearchField({ defaultValue }: { defaultValue?: string }) {
  const hintId = useId();
  return (
    <div className={searchFieldClass}>
      <label className={searchLabelClass}>
        <span className={legendClass}>{SEARCH_LABEL}</span>
        <input
          type="search"
          name="q"
          maxLength={SEARCH_MAX_LENGTH}
          defaultValue={defaultValue}
          aria-label={SEARCH_LABEL}
          aria-describedby={hintId}
          className={searchInputClass}
        />
      </label>
      <p id={hintId} className={searchHintClass}>
        company or role
      </p>
    </div>
  );
}
