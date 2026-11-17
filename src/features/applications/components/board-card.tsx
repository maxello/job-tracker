"use client";

import Link from "next/link";
import { useId, useState, type DragEvent, type Ref } from "react";
import type { Status } from "@/generated/prisma/enums";
import type { BoardApplication } from "../board";
import { STATUS_LABELS } from "../status";
import { STATUS_STYLES } from "../status-style";
import { LocalDate } from "./local-date";

type Props = {
  application: BoardApplication;
  pending: boolean;
  selectRef: Ref<HTMLSelectElement>;
  onMove: (to: Status) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
};

// A board card (US-5). The whole card is the drag source; the company link
// isn't draggable on its own, so dragging it drags the card. The select and
// Move are the keyboard and screen-reader path, with the detail page's rules:
// no auto-submit, Move disabled while the selection equals the status.
// A card re-mounts whenever its status changes (it moves to another column),
// so the selection starts from the status again.
export function BoardCard({
  application,
  pending,
  selectRef,
  onMove,
  onDragStart,
  onDragEnd,
}: Props) {
  const { company, role, status } = application;
  const [selected, setSelected] = useState(status);
  // A Client Component: ids come from useId() (#26).
  const selectId = `${useId()}-status`;
  const name = `${company}, ${role}`;

  return (
    <li
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-1 rounded-md border border-l-6 border-line p-3 ${
        pending ? "" : "cursor-grab"
      } ${STATUS_STYLES[status].panel}`}
    >
      <Link
        // from=board: the detail page's back link returns to the board.
        href={`/applications/${application.id}?from=board`}
        draggable={false}
        className="truncate font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {company}
      </Link>
      <p className="truncate text-sm text-muted">{role}</p>
      <p className="text-xs whitespace-nowrap text-muted">
        Updated{" "}
        <span className="ml-1 font-mono">
          <LocalDate date={application.updatedAt} />
        </span>
      </p>
      <label htmlFor={selectId} className="mt-2 text-xs font-medium">
        Status
      </label>
      {/* items-start: the select spans Move's face plus its lip (h-10.5 next
          to a py-2 text-sm button; h-7.5 next to the compact py-1 text-xs one).
          Below md the card is full width, the primary touch path, so the
          controls keep their full size. From md the column can be 13rem
          (about 159px of content), so both controls shrink and stay on one
          row: the select drops its minimum width and takes what Move leaves. */}
      <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:gap-1.5">
        <span className="field-select min-w-28 flex-1 md:min-w-0">
          <select
            id={selectId}
            ref={selectRef}
            aria-label={`Status for ${name}`}
            value={selected}
            disabled={pending}
            onChange={(event) => setSelected(event.target.value as Status)}
            className="field h-10.5 w-full min-w-0 px-3 py-2.5 text-sm font-medium md:h-7.5 md:py-1 md:pl-2 md:text-xs"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </span>
        <button
          type="button"
          aria-label={`Move ${name}`}
          disabled={pending || selected === status}
          onClick={() => onMove(selected)}
          className="button-quiet shrink-0 px-3 py-2 text-sm md:px-2.5 md:py-1 md:text-xs"
        >
          Move
        </button>
      </div>
    </li>
  );
}
