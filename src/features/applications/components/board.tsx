import { Status } from "@/generated/prisma/enums";
import { getCurrentUserId } from "@/lib/current-user";
import { SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { hasArchivedApplications, listApplications } from "../queries";
import { STATUS_LABELS } from "../status";
import { BoardColumns } from "./board-columns";
import {
  boardClass,
  cardListClass,
  columnClass,
  countClass,
  headingClass,
  messageClass,
} from "./board-styles";
import { AllArchived, NoApplications } from "./empty-states";

// The board (US-5): every non-archived application of the current user,
// newest first, which is listApplications with no filters.
export async function Board() {
  const userId = await getCurrentUserId();
  const applications = await listApplications(userId);

  // Empty states 2 and 3 of US-6 replace the columns. The board has no "Show
  // archived", so state 2 links to the list's.
  if (applications.length === 0) {
    return (await hasArchivedApplications(userId)) ? (
      <AllArchived href={`/?archived=${SHOW_ARCHIVED_VALUE}`} />
    ) : (
      <NoApplications />
    );
  }

  return (
    <BoardColumns
      applications={applications.map(
        ({ id, company, role, status, updatedAt }) => ({
          id,
          company,
          role,
          status,
          updatedAt: updatedAt.toISOString(),
        }),
      )}
    />
  );
}

const pulse = "animate-pulse rounded bg-line";

// Same boxes as BoardColumns (board-styles.ts), so the headings don't move
// when the board loads. Column names are static, so they are visible text;
// counts and cards pulse. Card pulses are as tall as a real card.
export function BoardSkeleton() {
  return (
    <div className="forced-color-adjust-none">
      <p className="sr-only">Loading board</p>
      <div aria-hidden="true">
        <p className={messageClass} />
        <div className={boardClass}>
          {Object.values(Status).map((status) => (
            <section key={status} className={columnClass}>
              <h2 className={headingClass}>
                {STATUS_LABELS[status]}
                <span
                  className={`${countClass} ml-1.5 inline-block h-3 w-6 align-middle ${pulse}`}
                />
              </h2>
              <ul className={cardListClass}>
                <li className={`h-44 rounded-md ${pulse}`} />
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
