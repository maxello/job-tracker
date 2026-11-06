import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma/enums";
import { changeApplicationStatus, createApplication } from "./queries";

const { db, tx } = vi.hoisted(() => {
  const client = () => ({
    application: { create: vi.fn(), update: vi.fn() },
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
});
