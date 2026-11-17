import { Status } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "./status";

// A card on the board (US-5). updatedAt is an ISO string: the board's state
// lives in a Client Component.
export type BoardApplication = {
  id: string;
  company: string;
  role: string;
  status: Status;
  updatedAt: string;
};

// One column per status in enum order, empty ones included (they are drop
// targets). Input order is kept, so newest first stays newest first.
export function groupByStatus(
  applications: BoardApplication[],
): Record<Status, BoardApplication[]> {
  const columns = Object.fromEntries(
    Object.values(Status).map((status) => [status, [] as BoardApplication[]]),
  ) as Record<Status, BoardApplication[]>;
  for (const application of applications) {
    columns[application.status].push(application);
  }
  return columns;
}

// The optimistic move: the card takes its new status and goes first, as it
// will after the refresh (the move updates updatedAt). A new array, so
// useOptimistic can replay moves on the server's list.
export function applyMove(
  applications: BoardApplication[],
  move: { id: string; to: Status },
): BoardApplication[] {
  const moved = applications.find(({ id }) => id === move.id);
  if (!moved) return applications;
  return [
    { ...moved, status: move.to },
    ...applications.filter(({ id }) => id !== move.id),
  ];
}

// A drop into the card's own column isn't a move and sends no request.
export function isMove(card: { status: Status }, target: Status): boolean {
  return card.status !== target;
}

export function moveMessage(
  card: { company: string; role: string },
  to: Status,
): string {
  return `Moved ${card.company} (${card.role}) to ${STATUS_LABELS[to]}.`;
}
