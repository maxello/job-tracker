import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dateRange } from "./date-filter";
import {
  archiveApplication,
  changeApplicationStatus,
  countApplicationsByStatus,
  createApplication,
  deleteApplication,
  getApplication,
  hasArchivedApplications,
  listApplications,
  unarchiveApplication,
  updateApplication,
} from "./queries";

// Real-database checks the mocked unit tests can't make (SPEC.md decision log,
// 2026-11-06). Run with `npm run test:db` against job_tracker_e2e. Fixtures and
// assertions read the database directly; the functions under test are the DAL.

const createdUserIds: string[] = [];

// A raw User row: the DAL takes a userId and no sign-in happens here.
async function createUser() {
  const user = await db.user.create({
    data: {
      name: "DB Test",
      email: `db-test-${randomUUID()}@example.test`,
    },
  });
  createdUserIds.push(user.id);
  return user.id;
}

function historyOf(applicationId: string) {
  return db.statusChange.findMany({ where: { applicationId } });
}

async function readApplication(userId: string, id: string) {
  const application = await getApplication(userId, id);
  if (!application) throw new Error("application not found");
  return application;
}

afterAll(async () => {
  // Cascades to applications and their history.
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("getApplication (real database)", () => {
  it("US-0: another user's application comes back as null, the owner gets it", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const { id } = await createApplication(owner, {
      company: "Acme",
      role: "Engineer",
      stack: [],
    });

    expect((await getApplication(owner, id))?.id).toBe(id);
    expect(await getApplication(intruder, id)).toBeNull();
  });
});

describe("changeApplicationStatus (real database)", () => {
  // Injected failure: a trigger that rejects history inserts (not the initial
  // one) for applications with this company only, so no other data is affected
  // even if a crashed run leaves it behind.
  const FAIL_HISTORY_COMPANY = "__db_test_fail_history__";

  beforeAll(async () => {
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION db_test_fail_history() RETURNS trigger AS $$
      BEGIN
        IF NEW."from" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "Application"
          WHERE id = NEW."applicationId" AND company = '${FAIL_HISTORY_COMPANY}'
        ) THEN
          RAISE EXCEPTION 'db test: injected history insert failure';
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS db_test_fail_history ON "StatusChange"`,
    );
    await db.$executeRawUnsafe(`
      CREATE TRIGGER db_test_fail_history BEFORE INSERT ON "StatusChange"
      FOR EACH ROW EXECUTE FUNCTION db_test_fail_history()`);
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS db_test_fail_history ON "StatusChange"`,
    );
    await db.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS db_test_fail_history()`,
    );
  });

  it("US-3: a failed history insert rolls back the status update", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, {
      company: FAIL_HISTORY_COMPANY,
      role: "Engineer",
      stack: [],
    });

    await expect(
      changeApplicationStatus(userId, id, "APPLIED"),
    ).rejects.toThrow();

    const application = await readApplication(userId, id);
    expect(application.status).toBe("WISHLIST");
    expect(application.statusChanges).toMatchObject([
      { from: null, to: "WISHLIST" },
    ]);
  });

  it("US-3: concurrent changes are serialized by FOR UPDATE, so history has no gaps", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, {
      company: "Acme",
      role: "Engineer",
      stack: [],
    });

    // A holder transaction locks the row first, so both calls start their
    // transactions and wait on it; then it commits and they run.
    let calls: Promise<PromiseSettledResult<unknown>[]> | undefined;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${id} FOR UPDATE`;
        const [{ pid: holderPid }] = await tx.$queryRaw<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid`;

        calls = Promise.allSettled([
          changeApplicationStatus(userId, id, "APPLIED"),
          changeApplicationStatus(userId, id, "INTERVIEW"),
        ]);

        await waitUntilBlocked(holderPid, 2);
      },
      { timeout: 15_000 },
    );

    const results = await calls!;
    expect(results).toEqual([
      { status: "fulfilled", value: "changed" },
      { status: "fulfilled", value: "changed" },
    ]);

    // Checked by from/to links, not changedAt order: concurrent transactions
    // can commit in a different order than they started.
    const changes = (await historyOf(id)).filter((c) => c.from !== null);
    expect(changes).toHaveLength(2);
    const first = changes.find((c) => c.from === "WISHLIST");
    const second = changes.find((c) => c !== first);
    expect(first).toBeDefined();
    expect(second?.from).toBe(first?.to);

    const application = await readApplication(userId, id);
    expect(application.status).toBe(second?.to);
  });

  it("US-3: changedAt is set, updatedAt changes on a change and not on a no-op", async () => {
    const userId = await createUser();
    const created = await createApplication(userId, {
      company: "Acme",
      role: "Engineer",
      stack: [],
    });

    // Tolerance allows for clock skew between this machine and the database.
    const before = Date.now() - 60_000;
    await expect(
      changeApplicationStatus(userId, created.id, "APPLIED"),
    ).resolves.toBe("changed");
    const after = Date.now() + 60_000;

    const changed = await readApplication(userId, created.id);
    expect(changed.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
    const change = changed.statusChanges.find((c) => c.to === "APPLIED");
    expect(change?.changedAt).toBeInstanceOf(Date);
    expect(change!.changedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(change!.changedAt.getTime()).toBeLessThanOrEqual(after);

    await expect(
      changeApplicationStatus(userId, created.id, "APPLIED"),
    ).resolves.toBe("unchanged");

    const unchanged = await readApplication(userId, created.id);
    expect(unchanged.updatedAt).toEqual(changed.updatedAt);
    expect(unchanged.statusChanges).toHaveLength(changed.statusChanges.length);
  });
});

describe("updateApplication and deleteApplication (real database)", () => {
  it("US-4: cleared optional fields are stored as NULL, status is untouched, updatedAt changes", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, {
      company: "Acme",
      role: "Engineer",
      url: "https://example.com/jobs/1",
      notes: "Referred by a friend",
      location: "Kyiv",
      level: "Senior",
      stack: ["React"],
      salaryMin: 1000,
      salaryMax: 2000,
      salaryCurrency: "USD",
    });
    await changeApplicationStatus(userId, id, "INTERVIEW");
    const before = await readApplication(userId, id);

    await expect(
      updateApplication(userId, id, {
        company: "Acme",
        role: "Engineer",
        stack: [],
      }),
    ).resolves.toBe("updated");

    const after = await readApplication(userId, id);
    expect(after).toMatchObject({
      url: null,
      notes: null,
      location: null,
      level: null,
      stack: [],
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      status: "INTERVIEW",
    });
    expect(after.statusChanges).toHaveLength(before.statusChanges.length);
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );

    // SQL NULL, checked by the database itself.
    const [{ count }] = await db.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "Application"
      WHERE id = ${id}
        AND url IS NULL AND notes IS NULL AND location IS NULL
        AND level IS NULL AND "salaryMin" IS NULL AND "salaryMax" IS NULL
        AND "salaryCurrency" IS NULL`;
    expect(count).toBe(1);
  });

  it("US-4: delete cascades to the status history", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, {
      company: "Acme",
      role: "Engineer",
      stack: [],
    });
    await changeApplicationStatus(userId, id, "APPLIED");
    await changeApplicationStatus(userId, id, "INTERVIEW");
    expect(await historyOf(id)).toHaveLength(3);

    await expect(deleteApplication(userId, id)).resolves.toBe("deleted");

    expect(await getApplication(userId, id)).toBeNull();
    expect(await historyOf(id)).toEqual([]);
  });
});

describe("archive and unarchive (real database)", () => {
  const input = { company: "Acme", role: "Engineer", stack: [] };

  it("US-8: archive sets archivedAt and changes updatedAt, leaves status and history alone, and repeating it changes nothing", async () => {
    const userId = await createUser();
    const created = await createApplication(userId, input);

    await expect(archiveApplication(userId, created.id)).resolves.toBe(
      "archived",
    );

    const archived = await readApplication(userId, created.id);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
    expect(archived.status).toBe("WISHLIST");
    expect(archived.statusChanges).toHaveLength(1);

    await expect(archiveApplication(userId, created.id)).resolves.toBe(
      "unchanged",
    );

    const again = await readApplication(userId, created.id);
    expect(again.archivedAt).toEqual(archived.archivedAt);
    expect(again.updatedAt).toEqual(archived.updatedAt);
  });

  it("US-8: unarchive clears archivedAt and changes updatedAt, and repeating it changes nothing", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, input);
    await archiveApplication(userId, id);
    const archived = await readApplication(userId, id);

    await expect(unarchiveApplication(userId, id)).resolves.toBe("unarchived");

    const active = await readApplication(userId, id);
    expect(active.archivedAt).toBeNull();
    expect(active.updatedAt.getTime()).toBeGreaterThan(
      archived.updatedAt.getTime(),
    );

    await expect(unarchiveApplication(userId, id)).resolves.toBe("unchanged");

    const again = await readApplication(userId, id);
    expect(again.archivedAt).toBeNull();
    expect(again.updatedAt).toEqual(active.updatedAt);
  });

  it("US-0: another user's application can't be archived or unarchived", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const active = await createApplication(owner, input);
    const archived = await createApplication(owner, input);
    await archiveApplication(owner, archived.id);

    await expect(archiveApplication(intruder, active.id)).resolves.toBe(
      "not-found",
    );
    await expect(unarchiveApplication(intruder, archived.id)).resolves.toBe(
      "not-found",
    );

    expect((await readApplication(owner, active.id)).archivedAt).toBeNull();
    expect(
      (await readApplication(owner, archived.id)).archivedAt,
    ).toBeInstanceOf(Date);
  });

  it("US-8: the list hides archived rows by default and shows them with Show archived, in last-updated order and only the user's own", async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const active = await createApplication(userId, input);
    const archived = await createApplication(userId, input);
    await archiveApplication(userId, archived.id);
    const foreign = await createApplication(otherUserId, input);
    await archiveApplication(otherUserId, foreign.id);

    const byDefault = await listApplications(userId);
    expect(byDefault.map((a) => a.id)).toEqual([active.id]);

    // Archiving changed updatedAt last, so the archived row comes first.
    const withArchived = await listApplications(userId, {
      includeArchived: true,
    });
    expect(withArchived.map((a) => a.id)).toEqual([archived.id, active.id]);
    expect(withArchived[0]?.archivedAt).toBeInstanceOf(Date);
    expect(withArchived[1]?.archivedAt).toBeNull();
  });

  it("US-8: hasArchivedApplications reflects only the user's own archived rows", async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const { id } = await createApplication(userId, input);
    const foreign = await createApplication(otherUserId, input);
    await archiveApplication(otherUserId, foreign.id);

    await expect(hasArchivedApplications(userId)).resolves.toBe(false);

    await archiveApplication(userId, id);

    await expect(hasArchivedApplications(userId)).resolves.toBe(true);
  });

  it("US-8: a status change on an archived application writes history and keeps it archived", async () => {
    const userId = await createUser();
    const { id } = await createApplication(userId, input);
    await archiveApplication(userId, id);
    const archived = await readApplication(userId, id);
    expect(archived.archivedAt).toBeInstanceOf(Date);

    await expect(changeApplicationStatus(userId, id, "APPLIED")).resolves.toBe(
      "changed",
    );

    const after = await readApplication(userId, id);
    expect(after.status).toBe("APPLIED");
    expect(after.statusChanges).toHaveLength(2);
    expect(after.archivedAt).toEqual(archived.archivedAt);
  });
});

// US-6 search against Postgres: Prisma's `contains` and ILIKE behaviour can't
// be checked with a mocked client (SPEC.md decision log, 2026-11-16).
describe("search (real database)", () => {
  async function create(userId: string, company: string, role = "Engineer") {
    const { id } = await createApplication(userId, {
      company,
      role,
      stack: [],
    });
    return id;
  }

  async function search(
    userId: string,
    text: string,
    options: Omit<Parameters<typeof listApplications>[1] & {}, "search"> = {},
  ) {
    const rows = await listApplications(userId, { ...options, search: text });
    return rows.map((row) => row.id).sort();
  }

  const ids = (...list: string[]) => [...list].sort();

  it("D1 US-6: matches company OR role, case-insensitive substring", async () => {
    const userId = await createUser();
    const acme = await create(userId, "Acme");
    const frontend = await create(userId, "Globex", "Senior Frontend Engineer");
    await create(userId, "Initech", "Backend Engineer");

    expect(await search(userId, "CME")).toEqual(ids(acme));
    expect(await search(userId, "frontend")).toEqual(ids(frontend));
  });

  it("D2 US-6: the whole text is one phrase, not separate words", async () => {
    const userId = await createUser();
    const phrase = await create(userId, "Acme Dev Shop");
    await create(userId, "Acme", "Developer");

    expect(await search(userId, "acme dev")).toEqual(ids(phrase));
  });

  it("D3 US-6: %, _ and \\ match literally", async () => {
    const userId = await createUser();
    const percent = await create(userId, "100% Remote");
    await create(userId, "100x Remote");
    const underscore = await create(userId, "a_b");
    await create(userId, "axb");
    const backslash = await create(userId, "back\\slash");

    expect(await search(userId, "100%")).toEqual(ids(percent));
    expect(await search(userId, "a_b")).toEqual(ids(underscore));
    expect(await search(userId, "k\\s")).toEqual(ids(backslash));
  });

  it("D4 US-6: case-insensitive for Cyrillic", async () => {
    const userId = await createUser();
    const lower = await create(userId, "Привіт Ltd");
    const upper = await create(userId, "ПРИВІТ Co");
    await create(userId, "Hello Ltd");

    expect(await search(userId, "ПРИВІТ")).toEqual(ids(lower, upper));
    expect(await search(userId, "привіт")).toEqual(ids(lower, upper));
  });

  it("D5 US-6: an archived match is hidden unless Show archived is on", async () => {
    const userId = await createUser();
    const active = await create(userId, "Acme Active");
    const archived = await create(userId, "Acme Archived");
    await archiveApplication(userId, archived);
    await create(userId, "Globex");

    expect(await search(userId, "acme")).toEqual(ids(active));
    expect(await search(userId, "acme", { includeArchived: true })).toEqual(
      ids(active, archived),
    );
  });

  it("D6 US-6: search and the status filter combine (AND)", async () => {
    const userId = await createUser();
    const applied = await create(userId, "Acme Applied");
    await changeApplicationStatus(userId, applied, "APPLIED");
    await create(userId, "Acme Wishlist");
    const otherApplied = await create(userId, "Globex Applied");
    await changeApplicationStatus(userId, otherApplied, "APPLIED");

    expect(await search(userId, "acme", { statuses: ["APPLIED"] })).toEqual(
      ids(applied),
    );
  });

  it("D7 US-0: another user's application never comes back, even when the text matches", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    // One owner row matches by company and one by role, so a userId that
    // guards only one branch of the OR leaks the other.
    await create(owner, "Shared Name Co");
    await create(owner, "Owner Co", "Shared Name Engineer");
    const own = await create(intruder, "Shared Name Ltd");
    await create(intruder, "Unrelated");

    expect(await search(intruder, "shared name")).toEqual(ids(own));
  });
});

// US-6 date range: the boundaries from dateRange applied by the real database.
// Rows can't be backdated through the app, so the fixture sets updatedAt with
// raw SQL after every other write (archiving and status changes move it).
describe("date range (real database)", () => {
  async function create(
    userId: string,
    updatedAt: string,
    company = "Dated Co",
  ) {
    const { id } = await createApplication(userId, {
      company,
      role: "Engineer",
      stack: [],
    });
    await setUpdatedAt(id, updatedAt);
    return id;
  }

  async function setUpdatedAt(id: string, updatedAt: string) {
    await db.$executeRaw`
      UPDATE "Application" SET "updatedAt" = ${new Date(updatedAt)}
      WHERE id = ${id}`;
  }

  async function between(
    userId: string,
    [from, to, tz]: [string | undefined, string | undefined, string],
    options: Omit<Parameters<typeof listApplications>[1] & {}, "updated"> = {},
  ) {
    const rows = await listApplications(userId, {
      ...options,
      updated: dateRange(from, to, tz),
    });
    return rows.map((row) => row.id).sort();
  }

  const ids = (...list: string[]) => [...list].sort();
  const KYIV = "Europe/Kyiv";

  // 2026-03-29 in Kyiv runs from 03-28T22:00Z (+02:00) to 03-29T21:00Z
  // (+03:00 after 03:00 → 04:00): 23 hours.
  it("D8 US-6: a 23-hour DST day in Kyiv is inclusive at both edges and nothing more", async () => {
    const userId = await createUser();
    await create(userId, "2026-03-28T21:59:59.999Z");
    const first = await create(userId, "2026-03-28T22:00:00.000Z");
    const last = await create(userId, "2026-03-29T20:59:59.999Z");
    await create(userId, "2026-03-29T21:00:00.000Z");

    expect(await between(userId, ["2026-03-29", "2026-03-29", KYIV])).toEqual(
      ids(first, last),
    );
  });

  // 2026-10-25 in Kyiv runs from 10-24T21:00Z (+03:00) to 10-25T22:00Z
  // (+02:00 after 04:00 → 03:00): 25 hours.
  it("D9 US-6: a 25-hour DST day in Kyiv is inclusive at both edges and nothing more", async () => {
    const userId = await createUser();
    await create(userId, "2026-10-24T20:59:59.999Z");
    const first = await create(userId, "2026-10-24T21:00:00.000Z");
    const last = await create(userId, "2026-10-25T21:59:59.999Z");
    await create(userId, "2026-10-25T22:00:00.000Z");

    expect(await between(userId, ["2026-10-25", "2026-10-25", KYIV])).toEqual(
      ids(first, last),
    );
  });

  it("D10 US-6: from alone and to alone are each inclusive at their edge", async () => {
    const userId = await createUser();
    const before = await create(userId, "2026-03-28T21:59:59.999Z");
    const start = await create(userId, "2026-03-28T22:00:00.000Z");
    const end = await create(userId, "2026-03-29T20:59:59.999Z");
    const after = await create(userId, "2026-03-29T21:00:00.000Z");

    expect(await between(userId, ["2026-03-29", undefined, KYIV])).toEqual(
      ids(start, end, after),
    );
    expect(await between(userId, [undefined, "2026-03-29", KYIV])).toEqual(
      ids(before, start, end),
    );
  });

  it("D11 US-6: from later than to returns nothing, without an error and without a swap", async () => {
    const userId = await createUser();
    const first = await create(userId, "2026-11-17T12:00:00.000Z");
    const second = await create(userId, "2026-11-18T12:00:00.000Z");

    expect(await between(userId, ["2026-11-17", "2026-11-18", "UTC"])).toEqual(
      ids(first, second),
    );
    expect(await between(userId, ["2026-11-18", "2026-11-17", "UTC"])).toEqual(
      [],
    );
  });

  it("D12 US-6: the date range combines with search, a status and Show archived (AND)", async () => {
    const userId = await createUser();
    const inRange = "2026-11-17T12:00:00.000Z";
    const match = await create(userId, inRange, "Acme Match");
    await changeApplicationStatus(userId, match, "APPLIED");
    await setUpdatedAt(match, inRange);
    await create(userId, inRange, "Acme Wishlist");
    const early = await create(userId, "2026-11-10T12:00:00.000Z", "Acme Old");
    await changeApplicationStatus(userId, early, "APPLIED");
    await setUpdatedAt(early, "2026-11-10T12:00:00.000Z");
    const other = await create(userId, inRange, "Globex");
    await changeApplicationStatus(userId, other, "APPLIED");
    await setUpdatedAt(other, inRange);
    const archived = await create(userId, inRange, "Acme Archived");
    await changeApplicationStatus(userId, archived, "APPLIED");
    await archiveApplication(userId, archived);
    await setUpdatedAt(archived, inRange);

    const range: [string, string, string] = ["2026-11-17", "2026-11-17", "UTC"];
    const filters = { search: "acme", statuses: ["APPLIED" as const] };
    expect(await between(userId, range, filters)).toEqual(ids(match));
    expect(
      await between(userId, range, { ...filters, includeArchived: true }),
    ).toEqual(ids(match, archived));
  });

  it("D13 US-0: another user's application in the range never comes back", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    await create(owner, "2026-11-17T12:00:00.000Z");
    const own = await create(intruder, "2026-11-17T13:00:00.000Z");
    await create(intruder, "2026-11-20T12:00:00.000Z");

    expect(
      await between(intruder, ["2026-11-17", "2026-11-17", "UTC"]),
    ).toEqual(ids(own));
  });

  // ICU uses historical local mean time (LMT): Pago Pago is +12:37:12 in year
  // 1 and −11:00 in 9999, so 0001-01-01 starts in 1 BC UTC and the day after
  // 9999-12-31 starts in year 10000. The precondition is asserted first, so a
  // change in ICU's data fails here instead of letting D14 pass without
  // testing the edges.
  it("D14 US-6: the extreme dates in Pago Pago reach 1 BC and year 10000, and the database accepts both", async () => {
    const zone = "Pacific/Pago_Pago";
    const range = dateRange("0001-01-01", "9999-12-31", zone);
    expect(
      range.gte?.getUTCFullYear(),
      "gte is in 1 BC UTC",
    ).toBeLessThanOrEqual(0);
    expect(
      range.lt?.getUTCFullYear(),
      "lt is in year 10000 or later",
    ).toBeGreaterThanOrEqual(10000);

    const userId = await createUser();
    const old = await create(userId, "2026-11-17T12:00:00.000Z");
    const recent = await create(userId, new Date().toISOString());

    expect(await between(userId, ["0001-01-01", "9999-12-31", zone])).toEqual(
      ids(old, recent),
    );
    expect(await between(userId, ["0001-01-01", undefined, zone])).toEqual(
      ids(old, recent),
    );
    expect(await between(userId, [undefined, "9999-12-31", zone])).toEqual(
      ids(old, recent),
    );
  });
});

// Polls until `count` sessions wait on the holder: directly, or behind another
// waiter that does (the second row-lock waiter queues behind the first).
// Matching the holder's pid ignores unrelated sessions.
async function waitUntilBlocked(holderPid: number, count: number) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const [{ blocked }] = await db.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity a
      WHERE a.pid <> ${holderPid}::int AND (
        ${holderPid}::int = ANY(pg_blocking_pids(a.pid))
        OR EXISTS (
          SELECT 1 FROM pg_stat_activity b
          WHERE b.pid = ANY(pg_blocking_pids(a.pid))
            AND ${holderPid}::int = ANY(pg_blocking_pids(b.pid))
        )
      )`;
    if (blocked >= count) return;
    if (Date.now() > deadline) {
      throw new Error(`only ${blocked} of ${count} calls blocked on the lock`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("status counts (real database)", () => {
  const input = { company: "Acme", role: "Engineer", stack: [] };

  async function createWithStatus(
    userId: string,
    status: Parameters<typeof changeApplicationStatus>[2],
  ) {
    const { id } = await createApplication(userId, input);
    if (status !== "WISHLIST") {
      await changeApplicationStatus(userId, id, status);
    }
    return id;
  }

  it("D15 US-6: counts every status, with 0 for a status that has no applications", async () => {
    const userId = await createUser();
    await createWithStatus(userId, "WISHLIST");
    await createWithStatus(userId, "WISHLIST");
    await createWithStatus(userId, "APPLIED");
    await createWithStatus(userId, "OFFER");

    await expect(countApplicationsByStatus(userId)).resolves.toEqual({
      WISHLIST: 2,
      APPLIED: 1,
      INTERVIEW: 0,
      OFFER: 1,
      REJECTED: 0,
    });
  });

  it("D16 US-6: archived applications are left out by default and counted with includeArchived", async () => {
    const userId = await createUser();
    await createWithStatus(userId, "INTERVIEW");
    const archived = await createWithStatus(userId, "INTERVIEW");
    await archiveApplication(userId, archived);

    expect((await countApplicationsByStatus(userId)).INTERVIEW).toBe(1);
    expect(
      (await countApplicationsByStatus(userId, { includeArchived: true }))
        .INTERVIEW,
    ).toBe(2);
  });

  it("D17 US-0: another user's applications are never counted", async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    await createWithStatus(userId, "REJECTED");
    await createWithStatus(otherUserId, "REJECTED");
    await createWithStatus(otherUserId, "APPLIED");
    const foreignArchived = await createWithStatus(otherUserId, "REJECTED");
    await archiveApplication(otherUserId, foreignArchived);

    for (const includeArchived of [false, true]) {
      await expect(
        countApplicationsByStatus(userId, { includeArchived }),
        `includeArchived=${includeArchived}`,
      ).resolves.toEqual({
        WISHLIST: 0,
        APPLIED: 0,
        INTERVIEW: 0,
        OFFER: 0,
        REJECTED: 1,
      });
    }
  });
});
