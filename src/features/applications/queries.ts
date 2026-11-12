import type { Status } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { CreateApplicationInput } from "./schemas";

// Data access layer: every function takes the current user's id explicitly.

export async function createApplication(
  userId: string,
  input: CreateApplicationInput,
) {
  // A nested create runs the Application insert and the initial history
  // record in one transaction.
  return db.application.create({
    data: {
      ...input,
      userId,
      status: "WISHLIST",
      statusChanges: { create: { from: null, to: "WISHLIST" } },
    },
  });
}

// Home page list, newest activity first: non-archived only, unless "Show
// archived" is on, which shows active and archived together (US-8).
// `statuses` filters with IN only when non-empty: Prisma's `in: []` matches
// nothing, so an empty list means no filter.
export async function listApplications(
  userId: string,
  {
    statuses = [],
    includeArchived = false,
  }: { statuses?: Status[]; includeArchived?: boolean } = {},
) {
  return db.application.findMany({
    where: {
      userId,
      ...(!includeArchived && { archivedAt: null }),
      ...(statuses.length > 0 && { status: { in: statuses } }),
    },
    // id breaks ties so the order is stable for equal timestamps.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      company: true,
      role: true,
      status: true,
      archivedAt: true,
      updatedAt: true,
    },
  });
}

// Detail page: null when the application doesn't exist or isn't the user's.
// Status history is read only through this ownership-checked application.
export async function getApplication(userId: string, id: string) {
  return db.application.findFirst({
    where: { id, userId },
    include: {
      statusChanges: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
    },
  });
}

// Replaces the editable fields. updateMany and deleteMany keep the ownership
// check in one statement and report a miss as count 0, where update and delete
// would throw P2025.
export async function updateApplication(
  userId: string,
  id: string,
  input: CreateApplicationInput,
): Promise<"updated" | "not-found"> {
  const { count } = await db.application.updateMany({
    where: { id, userId },
    // Listed by hand, so status and the owner can't get in. Prisma skips
    // undefined, so a cleared optional field has to be written as null.
    data: {
      company: input.company,
      role: input.role,
      url: input.url ?? null,
      notes: input.notes ?? null,
      location: input.location ?? null,
      level: input.level ?? null,
      stack: input.stack,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency ?? null,
    } satisfies Record<keyof CreateApplicationInput, unknown>,
  });
  return count === 0 ? "not-found" : "updated";
}

// Hard delete: onDelete: Cascade removes the status history.
export async function deleteApplication(
  userId: string,
  id: string,
): Promise<"deleted" | "not-found"> {
  const { count } = await db.application.deleteMany({ where: { id, userId } });
  return count === 0 ? "not-found" : "deleted";
}

// Archive and unarchive are separate intents, never a toggle (US-8). The write
// only matches the other state, so repeating the current one is a no-op and
// @updatedAt doesn't change. When nothing matched, an owner-scoped read tells
// "already in that state" from "not found". The two statements aren't a
// transaction: a change in between can only change that label, not the data.
async function setArchivedAt(
  userId: string,
  id: string,
  archive: boolean,
): Promise<"changed" | "unchanged" | "not-found"> {
  const { count } = await db.application.updateMany({
    where: { id, userId, archivedAt: archive ? null : { not: null } },
    data: { archivedAt: archive ? new Date() : null },
  });
  if (count > 0) return "changed";

  const existing = await db.application.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return existing ? "unchanged" : "not-found";
}

export async function archiveApplication(
  userId: string,
  id: string,
): Promise<"archived" | "unchanged" | "not-found"> {
  const result = await setArchivedAt(userId, id, true);
  return result === "changed" ? "archived" : result;
}

export async function unarchiveApplication(
  userId: string,
  id: string,
): Promise<"unarchived" | "unchanged" | "not-found"> {
  const result = await setArchivedAt(userId, id, false);
  return result === "changed" ? "unarchived" : result;
}

// For the list's "All your applications are archived" empty state.
export async function hasArchivedApplications(userId: string) {
  const archived = await db.application.findFirst({
    where: { userId, archivedAt: { not: null } },
    select: { id: true },
  });
  return archived !== null;
}

export type ChangeStatusResult = "changed" | "unchanged" | "not-found";

// The only place a status changes (detail page now, kanban in M5).
export async function changeApplicationStatus(
  userId: string,
  id: string,
  to: Status,
): Promise<ChangeStatusResult> {
  return db.$transaction(async (tx) => {
    // FOR UPDATE checks ownership and locks the row, so concurrent changes run
    // one after another and `from` is always the status actually in the
    // database (last write wins, history has no gaps).
    const rows = await tx.$queryRaw<{ status: Status }[]>`
      SELECT status FROM "Application"
      WHERE id = ${id} AND "userId" = ${userId}
      FOR UPDATE`;
    const current = rows[0]?.status;
    if (current === undefined) return "not-found";

    // Same status is a no-op: no update, so @updatedAt doesn't change.
    if (current === to) return "unchanged";

    await tx.application.update({
      where: { id, userId },
      data: { status: to },
    });
    await tx.statusChange.create({
      data: { applicationId: id, from: current, to },
    });
    return "changed";
  });
}
