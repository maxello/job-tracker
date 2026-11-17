import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma/enums";
import {
  archiveApplication,
  changeApplicationStatus,
  createApplication,
  deleteApplication,
  hasArchivedApplications,
  listApplications,
  unarchiveApplication,
  updateApplication,
} from "./queries";

const { db, tx } = vi.hoisted(() => {
  const client = () => ({
    application: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    statusChange: { create: vi.fn() },
  });
  return {
    db: { ...client(), $transaction: vi.fn() },
    tx: { ...client(), $queryRaw: vi.fn() },
  };
});

vi.mock("@/lib/db", () => ({ db }));

const OWNER = "user-a";
const OTHER_USER = "user-b";
const APPLICATION_ID = "application-1";

const statuses = Object.values(Status);
const transitions = statuses.flatMap((from) =>
  statuses.filter((to) => to !== from).map((to) => [from, to] as const),
);

// One application in the fake table. The fake applies the bound parameters of
// the query it receives, so without the query's own `userId` condition another
// user's row would be returned and the US-0 tests would fail.
function givenApplication(status: Status) {
  tx.$queryRaw.mockImplementation(
    async (strings: readonly string[], ...values: unknown[]) => {
      const sql = strings.join("?");
      const matchesId = values[0] === APPLICATION_ID;
      const matchesUser = !/"userId"\s*=\s*\?/.test(sql) || values[1] === OWNER;
      return matchesId && matchesUser ? [{ status }] : [];
    },
  );
}

function expectNothingWritten() {
  expect(tx.application.update).not.toHaveBeenCalled();
  expect(tx.statusChange.create).not.toHaveBeenCalled();
  expect(db.application.update).not.toHaveBeenCalled();
  expect(db.statusChange.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(
    async (run: (client: typeof tx) => unknown) => run(tx),
  );
});

describe("createApplication", () => {
  const input = { company: "Acme", role: "Engineer", stack: [] };

  it("US-1: a new application gets status Wishlist", async () => {
    await createApplication(OWNER, input);

    expect(db.application.create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({
        ...input,
        userId: OWNER,
        status: "WISHLIST",
      }),
    });
  });

  // A nested create is one Prisma write, so no separate statusChange call or
  // explicit transaction is expected.
  it("US-1: the history record (from: none, to: Wishlist) is written in the same write as the application", async () => {
    await createApplication(OWNER, input);

    expect(db.application.create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({
        statusChanges: { create: { from: null, to: "WISHLIST" } },
      }),
    });
    expect(db.statusChange.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("listApplications", () => {
  const order = [{ updatedAt: "desc" }, { id: "desc" }];
  const query = () => db.application.findMany.mock.calls[0]?.[0];

  beforeEach(() => {
    db.application.findMany.mockResolvedValue([]);
  });

  it("US-6: without statuses the query has no status condition", async () => {
    await listApplications(OWNER);

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({ userId: OWNER, archivedAt: null });
  });

  // Prisma's `in: []` matches nothing, so an empty list must mean no filter.
  it("US-6: an empty statuses list adds no status condition", async () => {
    await listApplications(OWNER, { statuses: [] });

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({ userId: OWNER, archivedAt: null });
  });

  it("US-6: statuses filter with IN, keeping the userId scope, the archived exclusion and the US-2 order", async () => {
    await listApplications(OWNER, { statuses: ["APPLIED", "INTERVIEW"] });

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      status: { in: ["APPLIED", "INTERVIEW"] },
    });
    expect(query().orderBy).toEqual(order);
  });

  it("US-8: Show archived drops the archive condition, keeping the userId scope and the US-2 order", async () => {
    await listApplications(OWNER, { includeArchived: true });

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({ userId: OWNER });
    expect(query().orderBy).toEqual(order);
  });

  it("US-8: Show archived combines with the status filter", async () => {
    await listApplications(OWNER, {
      statuses: ["APPLIED"],
      includeArchived: true,
    });

    expect(query().where).toEqual({
      userId: OWNER,
      status: { in: ["APPLIED"] },
    });
  });

  it("US-8: rows carry archivedAt, so archived ones can be marked", async () => {
    await listApplications(OWNER, { includeArchived: true });

    expect(query().select).toHaveProperty("archivedAt", true);
  });

  const searchOn = (contains: string) => ({
    OR: [
      { company: { contains, mode: "insensitive" } },
      { role: { contains, mode: "insensitive" } },
    ],
  });

  it("Q1 US-6: search matches company OR role case-insensitively, keeping the userId scope, the archived exclusion and the US-2 order", async () => {
    await listApplications(OWNER, { search: "acme" });

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      ...searchOn("acme"),
    });
    expect(query().orderBy).toEqual(order);
  });

  // Prisma 7.10.1 doesn't escape LIKE wildcards, and `\` is LIKE's escape
  // character (probe, see the SPEC.md decision log).
  it("Q2 US-6: %, _ and \\ in the search are escaped so they match literally", async () => {
    await listApplications(OWNER, { search: "50%_a\\b" });

    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      ...searchOn("50\\%\\_a\\\\b"),
    });
  });

  it("Q3 US-6: search combines with the status filter (AND)", async () => {
    await listApplications(OWNER, { search: "acme", statuses: ["APPLIED"] });

    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      status: { in: ["APPLIED"] },
      ...searchOn("acme"),
    });
  });

  it("Q4 US-6: the date range bounds updatedAt, keeping the userId scope, the archived exclusion and the US-2 order", async () => {
    const gte = new Date("2026-11-16T22:00:00.000Z");
    const lt = new Date("2026-11-17T22:00:00.000Z");
    await listApplications(OWNER, { updated: { gte, lt } });

    expect(db.application.findMany).toHaveBeenCalledOnce();
    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      updatedAt: { gte, lt },
    });
    expect(query().orderBy).toEqual(order);
  });

  it("Q4 US-6: one bound alone is passed as is", async () => {
    const lt = new Date("2026-11-17T22:00:00.000Z");
    await listApplications(OWNER, { updated: { lt } });

    expect(query().where).toEqual({
      userId: OWNER,
      archivedAt: null,
      updatedAt: { lt },
    });
  });

  it("Q4 US-6: an empty range adds no updatedAt condition", async () => {
    await listApplications(OWNER, { updated: {} });

    expect(query().where).toEqual({ userId: OWNER, archivedAt: null });
  });
});

describe("changeApplicationStatus", () => {
  it.each(transitions)(
    "US-3: any transition between two different statuses is allowed (%s → %s)",
    async (from, to) => {
      givenApplication(from);

      await expect(
        changeApplicationStatus(OWNER, APPLICATION_ID, to),
      ).resolves.toBe("changed");

      expect(tx.application.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: APPLICATION_ID, userId: OWNER },
        data: { status: to },
      });
    },
  );

  // changedAt isn't asserted: it comes from the column's @default(now()), which
  // a mocked client can't exercise.
  it("US-3: each change is recorded in history (from, to)", async () => {
    givenApplication("APPLIED");

    await changeApplicationStatus(OWNER, APPLICATION_ID, "INTERVIEW");

    expect(tx.statusChange.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        applicationId: APPLICATION_ID,
        from: "APPLIED",
        to: "INTERVIEW",
      },
    });
  });

  it.each(statuses)("US-3: same status is a no-op (%s)", async (status) => {
    givenApplication(status);

    await expect(
      changeApplicationStatus(OWNER, APPLICATION_ID, status),
    ).resolves.toBe("unchanged");

    // No update means @updatedAt doesn't change; no create means no history.
    expectNothingWritten();
  });

  it("US-3: the status update and the history record are written in one transaction", async () => {
    givenApplication("APPLIED");

    await changeApplicationStatus(OWNER, APPLICATION_ID, "OFFER");

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.application.update).toHaveBeenCalledOnce();
    expect(tx.statusChange.create).toHaveBeenCalledOnce();
    expect(db.application.update).not.toHaveBeenCalled();
    expect(db.statusChange.create).not.toHaveBeenCalled();
  });

  it("US-3: a failed history write's error reaches $transaction", async () => {
    givenApplication("APPLIED");
    const failure = new Error("history insert failed");
    tx.statusChange.create.mockRejectedValue(failure);

    await expect(
      changeApplicationStatus(OWNER, APPLICATION_ID, "OFFER"),
    ).rejects.toBe(failure);

    // Prisma rolls back when the callback rejects, so the error must reach it.
    await expect(db.$transaction.mock.results[0]?.value).rejects.toBe(failure);
  });

  it("US-3: a failed status update fails the transaction and writes no history", async () => {
    givenApplication("APPLIED");
    const failure = new Error("update failed");
    tx.application.update.mockRejectedValue(failure);

    await expect(
      changeApplicationStatus(OWNER, APPLICATION_ID, "OFFER"),
    ).rejects.toBe(failure);

    await expect(db.$transaction.mock.results[0]?.value).rejects.toBe(failure);
    expect(tx.statusChange.create).not.toHaveBeenCalled();
  });

  it("US-0: changing the status of another user's application gets not-found and changes nothing", async () => {
    givenApplication("APPLIED");

    await expect(
      changeApplicationStatus(OTHER_USER, APPLICATION_ID, "OFFER"),
    ).resolves.toBe("not-found");

    expectNothingWritten();
  });

  it("US-0: another user's application is not-found even when the status matches", async () => {
    givenApplication("APPLIED");

    await expect(
      changeApplicationStatus(OTHER_USER, APPLICATION_ID, "APPLIED"),
    ).resolves.toBe("not-found");

    expectNothingWritten();
  });

  it("US-0: an id that does not exist gets the same not-found response", async () => {
    givenApplication("APPLIED");

    await expect(
      changeApplicationStatus(OWNER, "no-such-application", "OFFER"),
    ).resolves.toBe("not-found");

    expectNothingWritten();
  });

  it("US-8: a status change writes only the status, so an archived application stays archived", async () => {
    givenApplication("WISHLIST");

    await changeApplicationStatus(OWNER, APPLICATION_ID, "APPLIED");

    expect(tx.application.update.mock.calls[0]?.[0].data).toEqual({
      status: "APPLIED",
    });
  });
});

// The fake applies the `where` it receives: without the query's own `userId`
// condition another user's row would match and the US-0 tests would fail.
function matchesStoredApplication(where: { id?: string; userId?: string }) {
  const matchesUser = !("userId" in where) || where.userId === OWNER;
  return where.id === APPLICATION_ID && matchesUser;
}

function givenStoredApplication() {
  const count = async ({ where }: { where: { id?: string } }) => ({
    count: matchesStoredApplication(where) ? 1 : 0,
  });
  db.application.updateMany.mockImplementation(count);
  db.application.deleteMany.mockImplementation(count);
}

describe("updateApplication", () => {
  const required = { company: "Acme", role: "Engineer", stack: [] };
  const full = {
    company: "Acme",
    role: "Engineer",
    url: "https://example.com/jobs/1",
    notes: "Referred by a friend",
    location: "Kyiv",
    level: "Senior",
    stack: ["React", "Node"],
    salaryMin: 1000,
    salaryMax: 2000,
    salaryCurrency: "USD",
  };

  const writtenData = () => db.application.updateMany.mock.calls[0]?.[0].data;

  beforeEach(givenStoredApplication);

  it("US-4: all fields are saved", async () => {
    await expect(updateApplication(OWNER, APPLICATION_ID, full)).resolves.toBe(
      "updated",
    );

    expect(db.application.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: APPLICATION_ID, userId: OWNER },
      data: full,
    });
  });

  // Prisma skips undefined, so a cleared field must be written as null.
  it.each([
    "url",
    "notes",
    "location",
    "level",
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
  ])("US-4: clearing %s writes null", async (field) => {
    await updateApplication(OWNER, APPLICATION_ID, required);

    expect(writtenData()).toHaveProperty(field, null);
  });

  it("US-4: clearing the stack writes an empty list", async () => {
    await updateApplication(OWNER, APPLICATION_ID, required);

    expect(writtenData().stack).toEqual([]);
  });

  it("US-4: a salary of 0 is kept, not cleared", async () => {
    await updateApplication(OWNER, APPLICATION_ID, {
      ...required,
      salaryMin: 0,
      salaryMax: 0,
      salaryCurrency: "USD",
    });

    expect(writtenData()).toMatchObject({ salaryMin: 0, salaryMax: 0 });
  });

  it("US-4: status, owner and archive state are not part of the update", async () => {
    // A forged field that got past the types must still not reach the database.
    const forged = {
      ...full,
      status: "OFFER",
      userId: OTHER_USER,
      archivedAt: null,
    };

    await updateApplication(OWNER, APPLICATION_ID, forged);

    expect(Object.keys(writtenData()).sort()).toEqual(Object.keys(full).sort());
  });

  it("US-4: editing fields does not write status history", async () => {
    await updateApplication(OWNER, APPLICATION_ID, full);

    expect(db.statusChange.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("US-8: an archived application stays editable", async () => {
    await updateApplication(OWNER, APPLICATION_ID, full);

    expect(
      db.application.updateMany.mock.calls[0]?.[0].where,
    ).not.toHaveProperty("archivedAt");
  });

  it("US-0: editing another user's application gets not-found", async () => {
    await expect(
      updateApplication(OTHER_USER, APPLICATION_ID, full),
    ).resolves.toBe("not-found");
  });

  it("US-0: an id that does not exist gets the same not-found response", async () => {
    await expect(
      updateApplication(OWNER, "no-such-application", full),
    ).resolves.toBe("not-found");
  });
});

describe("deleteApplication", () => {
  beforeEach(givenStoredApplication);

  it("US-4: delete removes the user's application", async () => {
    await expect(deleteApplication(OWNER, APPLICATION_ID)).resolves.toBe(
      "deleted",
    );

    expect(db.application.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: APPLICATION_ID, userId: OWNER },
    });
  });

  it("US-8: an archived application can be deleted", async () => {
    await deleteApplication(OWNER, APPLICATION_ID);

    expect(
      db.application.deleteMany.mock.calls[0]?.[0].where,
    ).not.toHaveProperty("archivedAt");
  });

  it("US-0: deleting another user's application gets not-found", async () => {
    await expect(deleteApplication(OTHER_USER, APPLICATION_ID)).resolves.toBe(
      "not-found",
    );
  });

  it("US-0: an id that does not exist gets the same not-found response", async () => {
    await expect(deleteApplication(OWNER, "no-such-application")).resolves.toBe(
      "not-found",
    );
  });
});

// One stored application of OWNER with the given archive state. The fake
// applies the whole `where` it receives, including the archive condition, so a
// write without that condition would also hit an application already in the
// target state, and one without `userId` would hit another user's row.
type ArchiveCondition = null | { not: null } | undefined;

function givenArchiveState(archived: boolean) {
  const matches = (where: {
    id?: string;
    userId?: string;
    archivedAt?: ArchiveCondition;
  }) => {
    if (!matchesStoredApplication(where)) return false;
    if (where.archivedAt === undefined) return true;
    if (where.archivedAt === null) return !archived;
    if (where.archivedAt.not === null) return archived;
    throw new Error("unexpected archivedAt condition");
  };
  db.application.updateMany.mockImplementation(
    async ({ where }: { where: Parameters<typeof matches>[0] }) => ({
      count: matches(where) ? 1 : 0,
    }),
  );
  db.application.findFirst.mockImplementation(
    async ({ where }: { where: Parameters<typeof matches>[0] }) =>
      matches(where) ? { id: APPLICATION_ID } : null,
  );
}

function expectNoHistoryOrStatusWrite() {
  expect(db.statusChange.create).not.toHaveBeenCalled();
  expect(db.application.update).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
}

describe("archiveApplication", () => {
  it("US-8: archiving sets only archivedAt on the user's active application", async () => {
    givenArchiveState(false);

    await expect(archiveApplication(OWNER, APPLICATION_ID)).resolves.toBe(
      "archived",
    );

    expect(db.application.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: APPLICATION_ID, userId: OWNER, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
    expectNoHistoryOrStatusWrite();
  });

  it("US-8: archiving an archived application is a no-op", async () => {
    givenArchiveState(true);

    await expect(archiveApplication(OWNER, APPLICATION_ID)).resolves.toBe(
      "unchanged",
    );

    // The conditional update matched nothing, and nothing else is written.
    expect(db.application.updateMany).toHaveBeenCalledOnce();
    expectNoHistoryOrStatusWrite();
  });

  it("US-0: archiving another user's application gets not-found", async () => {
    givenArchiveState(false);

    await expect(archiveApplication(OTHER_USER, APPLICATION_ID)).resolves.toBe(
      "not-found",
    );
  });

  it("US-0: archiving an id that does not exist gets the same not-found response", async () => {
    givenArchiveState(false);

    await expect(
      archiveApplication(OWNER, "no-such-application"),
    ).resolves.toBe("not-found");
  });
});

describe("unarchiveApplication", () => {
  it("US-8: unarchiving clears only archivedAt on the user's archived application", async () => {
    givenArchiveState(true);

    await expect(unarchiveApplication(OWNER, APPLICATION_ID)).resolves.toBe(
      "unarchived",
    );

    expect(db.application.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: APPLICATION_ID, userId: OWNER, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    expectNoHistoryOrStatusWrite();
  });

  it("US-8: unarchiving an active application is a no-op", async () => {
    givenArchiveState(false);

    await expect(unarchiveApplication(OWNER, APPLICATION_ID)).resolves.toBe(
      "unchanged",
    );

    expect(db.application.updateMany).toHaveBeenCalledOnce();
    expectNoHistoryOrStatusWrite();
  });

  it("US-0: unarchiving another user's application gets not-found", async () => {
    givenArchiveState(true);

    await expect(
      unarchiveApplication(OTHER_USER, APPLICATION_ID),
    ).resolves.toBe("not-found");
  });

  it("US-0: unarchiving an id that does not exist gets the same not-found response", async () => {
    givenArchiveState(true);

    await expect(
      unarchiveApplication(OWNER, "no-such-application"),
    ).resolves.toBe("not-found");
  });
});

describe("hasArchivedApplications", () => {
  const query = () => db.application.findFirst.mock.calls[0]?.[0];

  it("US-8: true when the user has an archived application", async () => {
    db.application.findFirst.mockResolvedValue({ id: APPLICATION_ID });

    await expect(hasArchivedApplications(OWNER)).resolves.toBe(true);

    expect(query().where).toEqual({ userId: OWNER, archivedAt: { not: null } });
  });

  it("US-8: false when the user has none", async () => {
    db.application.findFirst.mockResolvedValue(null);

    await expect(hasArchivedApplications(OWNER)).resolves.toBe(false);
  });
});
