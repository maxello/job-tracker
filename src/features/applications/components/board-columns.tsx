"use client";

import {
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Status } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { changeStatusAction } from "../actions";
import {
  applyMove,
  groupByStatus,
  isMove,
  moveMessage,
  type BoardApplication,
} from "../board";
import { STATUS_LABELS } from "../status";
import { BoardCard } from "./board-card";
import {
  boardClass,
  cardListClass,
  columnClass,
  countClass,
  headingClass,
  messageClass,
} from "./board-styles";

const STATUS_FAILED = "Couldn't update the status. Please try again.";
const NO_LONGER_EXISTS = "This application no longer exists";

type Message = { text: string; error: boolean };

// Where focus goes once a keyboard move has settled (US-5): the moved card's
// select, or the heading of the column a vanished card was shown in.
type FocusTarget =
  { kind: "select"; id: string } | { kind: "heading"; status: Status };

export function BoardColumns({
  applications,
}: {
  applications: BoardApplication[];
}) {
  // Both optimistic values fall back to the server's when the move's
  // transition ends, which also delivers the refreshed board.
  const [cards, addMove] = useOptimistic(applications, applyMove);
  const [pendingIds, addPending] = useOptimistic<string[], string>(
    [],
    (ids, id) => [...ids, id],
  );
  // Column heading ids come from useId() (#26).
  const baseId = useId();
  // One live region; it stays until the next move starts.
  const [message, setMessage] = useState<Message>({ text: "", error: false });

  const selects = useRef(new Map<string, HTMLSelectElement>());
  const headings = useRef(new Map<Status, HTMLHeadingElement>());
  const focusTarget = useRef<FocusTarget | null>(null);
  // Native drag-and-drop doesn't expose dataTransfer during dragover, so the
  // dragged card lives here.
  const dragged = useRef<BoardApplication | null>(null);

  // Runs after every commit: the target is focused once it exists and is no
  // longer disabled (a pending card's select is).
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const element =
      target.kind === "select"
        ? selects.current.get(target.id)
        : headings.current.get(target.status);
    if (!element || (element instanceof HTMLSelectElement && element.disabled))
      return;
    element.focus();
    focusTarget.current = null;
  });

  function move(card: BoardApplication, to: Status, viaKeyboard: boolean) {
    setMessage({ text: "", error: false });
    startTransition(async () => {
      addMove({ id: card.id, to });
      addPending(card.id);

      const data = new FormData();
      data.set("id", card.id);
      data.set("status", to);
      let result: ActionResult<void, "status">;
      try {
        result = await changeStatusAction(null, data);
      } catch {
        // The request itself failed (network, server error): the card
        // returns when the transition ends.
        result = { ok: false, error: { message: STATUS_FAILED } };
      }

      if (result.ok) {
        setMessage({ text: moveMessage(card, to), error: false });
        if (viaKeyboard) focusTarget.current = { kind: "select", id: card.id };
      } else if (result.error.notFound) {
        setMessage({ text: NO_LONGER_EXISTS, error: true });
        if (viaKeyboard) {
          focusTarget.current = { kind: "heading", status: card.status };
        }
      } else {
        const text =
          result.error.message ??
          result.error.fieldErrors?.status?.[0] ??
          STATUS_FAILED;
        setMessage({ text, error: true });
        if (viaKeyboard) focusTarget.current = { kind: "select", id: card.id };
      }
    });
  }

  function onDragOver(event: DragEvent<HTMLElement>, status: Status) {
    // Only a real move is a valid drop: a drop into the card's own column
    // never fires, so it sends no request.
    const card = dragged.current;
    if (!card || !isMove(card, status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: DragEvent<HTMLElement>, status: Status) {
    const card = dragged.current;
    dragged.current = null;
    if (!card || !isMove(card, status)) return;
    event.preventDefault();
    move(card, status, false);
  }

  const columns = groupByStatus(cards);

  return (
    <div>
      <p
        role="status"
        className={`${messageClass} ${message.error ? "text-danger" : ""}`}
      >
        {message.text}
      </p>
      <div className={boardClass}>
        {Object.values(Status).map((status) => {
          const column = columns[status];
          return (
            <section
              key={status}
              aria-labelledby={`${baseId}-${status}`}
              onDragOver={(event) => onDragOver(event, status)}
              onDrop={(event) => onDrop(event, status)}
              className={columnClass}
            >
              <h2
                id={`${baseId}-${status}`}
                tabIndex={-1}
                ref={(element) => {
                  if (element) headings.current.set(status, element);
                }}
                className={headingClass}
              >
                {STATUS_LABELS[status]}
                <span className={countClass}>{` · ${column.length}`}</span>
              </h2>
              <ul className={cardListClass}>
                {column.map((card) => (
                  <BoardCard
                    key={card.id}
                    application={card}
                    pending={pendingIds.includes(card.id)}
                    selectRef={(element) => {
                      if (!element) return;
                      selects.current.set(card.id, element);
                      // React 19 cleanup: only drop the entry this card set,
                      // so a re-mount in another column isn't removed.
                      return () => {
                        if (selects.current.get(card.id) === element) {
                          selects.current.delete(card.id);
                        }
                      };
                    }}
                    onMove={(to) => move(card, to, true)}
                    onDragStart={(event) => {
                      dragged.current = card;
                      event.dataTransfer.effectAllowed = "move";
                      // Firefox starts a drag only with some data set.
                      event.dataTransfer.setData("text/plain", card.company);
                    }}
                    onDragEnd={() => {
                      dragged.current = null;
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
