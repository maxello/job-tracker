import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveApplicationAction,
  changeStatusAction,
  createApplicationAction,
  deleteApplicationAction,
  unarchiveApplicationAction,
  updateApplicationAction,
} from "./actions";

const mocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
  archiveApplication: vi.fn(),
  unarchiveApplication: vi.fn(),
  changeApplicationStatus: vi.fn(),
  tryGetCurrentUserId: vi.fn(),
  refresh: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("./queries", () => ({
  createApplication: mocks.createApplication,
  updateApplication: mocks.updateApplication,
  deleteApplication: mocks.deleteApplication,
  archiveApplication: mocks.archiveApplication,
  unarchiveApplication: mocks.unarchiveApplication,
  changeApplicationStatus: mocks.changeApplicationStatus,
}));
vi.mock("@/lib/current-user", () => ({
  tryGetCurrentUserId: mocks.tryGetCurrentUserId,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

const OWNER = "user-a";
const ID = "application-1";
const SAVE_FAILED = "Couldn't save the application. Please try again.";
const DELETE_FAILED = "Couldn't delete the application. Please try again.";

// Like the real functions, these throw, so code after them doesn't run.
class NotFoundSignal extends Error {}
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const valid = { company: "Acme", role: "Engineer" };
const parsed = { ...valid, stack: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.tryGetCurrentUserId.mockResolvedValue(OWNER);
  mocks.notFound.mockImplementation(() => {
    throw new NotFoundSignal();
  });
  mocks.redirect.mockImplementation((url: string) => {
    throw new RedirectSignal(url);
  });
});

describe("createApplicationAction", () => {
  it("US-1: a valid form is saved for the session user and redirects to the list", async () => {
    await expect(createApplicationAction(null, form(valid))).rejects.toEqual(
      new RedirectSignal("/"),
    );

    expect(mocks.createApplication).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      parsed,
    );
  });

  it("US-1: field errors come back with the submitted values", async () => {
    const result = await createApplicationAction(
      null,
      form({ company: "", role: "Engineer" }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: { company: expect.any(Array) } },
      values: { company: "", role: "Engineer" },
    });
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("US-1: a failed save returns a generic message and the values", async () => {
    mocks.createApplication.mockRejectedValue(new Error("connection refused"));

    await expect(createApplicationAction(null, form(valid))).resolves.toEqual({
      ok: false,
      error: { message: SAVE_FAILED },
      values: valid,
    });
  });
});

describe("updateApplicationAction", () => {
  const submit = (fields: Record<string, string>) =>
    updateApplicationAction(null, form(fields));

  beforeEach(() => {
    mocks.updateApplication.mockResolvedValue("updated");
  });

  it("US-4: a valid form is saved and redirects to the detail page", async () => {
    await expect(submit({ id: ID, ...valid })).rejects.toEqual(
      new RedirectSignal(`/applications/${ID}`),
    );

    expect(mocks.updateApplication).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      ID,
      parsed,
    );
  });

  it("US-4: the client cache is refreshed before the redirect", async () => {
    await expect(submit({ id: ID, ...valid })).rejects.toBeInstanceOf(
      RedirectSignal,
    );

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0]!,
    );
  });

  it("US-4: a cleared optional field reaches the DAL as absent", async () => {
    await expect(
      submit({ id: ID, ...valid, url: "", notes: "  ", stack: "" }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.updateApplication).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      ID,
      parsed,
    );
  });

  it("US-0: the owner comes from the session, and forged fields are ignored", async () => {
    await expect(
      submit({ id: ID, ...valid, userId: "user-b", status: "OFFER" }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.updateApplication).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      ID,
      parsed,
    );
  });

  it("US-4: invalid input returns field errors and values, and writes nothing", async () => {
    const result = await submit({ id: ID, company: "", role: "Engineer" });

    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: { company: expect.any(Array) } },
      values: { company: "", role: "Engineer" },
    });
    expect(mocks.updateApplication).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("US-0: a missing or foreign application gets the not-found response", async () => {
    mocks.updateApplication.mockResolvedValue("not-found");

    await expect(submit({ id: ID, ...valid })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { id: "" }],
    ["with a NUL byte", { id: "a\0b" }],
  ])("US-0: an id that is %s gets the not-found response", async (_, id) => {
    await expect(submit({ ...id, ...valid })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(mocks.updateApplication).not.toHaveBeenCalled();
  });

  it("US-4: a failed session read returns a generic message and the values", async () => {
    mocks.tryGetCurrentUserId.mockResolvedValue(null);

    await expect(submit({ id: ID, ...valid })).resolves.toEqual({
      ok: false,
      error: { message: SAVE_FAILED },
      values: valid,
    });
    expect(mocks.updateApplication).not.toHaveBeenCalled();
  });

  it("US-4: a failed save returns a generic message and never the real error", async () => {
    mocks.updateApplication.mockRejectedValue(new Error("connection refused"));

    const result = await submit({ id: ID, ...valid });

    expect(result).toEqual({
      ok: false,
      error: { message: SAVE_FAILED },
      values: valid,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("deleteApplicationAction", () => {
  const submit = (fields: Record<string, string>) =>
    deleteApplicationAction(null, form(fields));

  beforeEach(() => {
    mocks.deleteApplication.mockResolvedValue("deleted");
  });

  it("US-4: after deletion the user returns to the list", async () => {
    await expect(submit({ id: ID })).rejects.toEqual(new RedirectSignal("/"));

    expect(mocks.deleteApplication).toHaveBeenCalledExactlyOnceWith(OWNER, ID);
  });

  it("US-4: the client cache is refreshed before the redirect", async () => {
    await expect(submit({ id: ID })).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0]!,
    );
  });

  it("US-0: a missing or foreign application gets the not-found response", async () => {
    mocks.deleteApplication.mockResolvedValue("not-found");

    await expect(submit({ id: ID })).rejects.toBeInstanceOf(NotFoundSignal);

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { id: "" }],
    ["with a NUL byte", { id: "a\0b" }],
  ])("US-0: an id that is %s gets the not-found response", async (_, id) => {
    await expect(submit(id)).rejects.toBeInstanceOf(NotFoundSignal);

    expect(mocks.deleteApplication).not.toHaveBeenCalled();
  });

  it("US-4: a failed session read returns a generic message", async () => {
    mocks.tryGetCurrentUserId.mockResolvedValue(null);

    await expect(submit({ id: ID })).resolves.toEqual({
      ok: false,
      error: { message: DELETE_FAILED },
    });
    expect(mocks.deleteApplication).not.toHaveBeenCalled();
  });

  it("US-4: a failed delete returns a generic message and never the real error", async () => {
    mocks.deleteApplication.mockRejectedValue(new Error("connection refused"));

    await expect(submit({ id: ID })).resolves.toEqual({
      ok: false,
      error: { message: DELETE_FAILED },
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

// Archive and unarchive are separate intents with the same shape (SPEC.md
// decision log, 2026-11-12).
describe.each([
  {
    name: "archiveApplicationAction",
    action: archiveApplicationAction,
    dal: mocks.archiveApplication,
    done: "archived",
    failed: "Couldn't archive the application. Please try again.",
  },
  {
    name: "unarchiveApplicationAction",
    action: unarchiveApplicationAction,
    dal: mocks.unarchiveApplication,
    done: "unarchived",
    failed: "Couldn't unarchive the application. Please try again.",
  },
])("$name", ({ action, dal, done, failed }) => {
  const submit = (fields: Record<string, string>) => action(null, form(fields));

  beforeEach(() => {
    dal.mockResolvedValue(done);
  });

  it("US-8: the session user's application is changed and the page refreshes in place", async () => {
    await expect(submit({ id: ID })).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    expect(dal).toHaveBeenCalledExactlyOnceWith(OWNER, ID);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("US-0: the owner comes from the session, and a forged userId is ignored", async () => {
    await submit({ id: ID, userId: "user-b" });

    expect(dal).toHaveBeenCalledExactlyOnceWith(OWNER, ID);
  });

  it("US-8: a no-op still succeeds and refreshes, so a stale tab catches up", async () => {
    dal.mockResolvedValue("unchanged");

    await expect(submit({ id: ID })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("US-0: a missing or foreign application gets the not-found response", async () => {
    dal.mockResolvedValue("not-found");

    await expect(submit({ id: ID })).rejects.toBeInstanceOf(NotFoundSignal);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { id: "" }],
    ["with a NUL byte", { id: "a\0b" }],
  ])("US-0: an id that is %s gets the not-found response", async (_, id) => {
    await expect(submit(id)).rejects.toBeInstanceOf(NotFoundSignal);

    expect(dal).not.toHaveBeenCalled();
  });

  it("US-8: a failed session read returns a generic message", async () => {
    mocks.tryGetCurrentUserId.mockResolvedValue(null);

    await expect(submit({ id: ID })).resolves.toEqual({
      ok: false,
      error: { message: failed },
    });
    expect(dal).not.toHaveBeenCalled();
  });

  it("US-8: a failed write returns a generic message, logs the real error and never returns it", async () => {
    const error = new Error("connection refused");
    dal.mockRejectedValue(error);

    await expect(submit({ id: ID })).resolves.toEqual({
      ok: false,
      error: { message: failed },
    });
    expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("changeStatusAction", () => {
  const STATUS_FAILED = "Couldn't update the status. Please try again.";
  const submit = (fields: Record<string, string>) =>
    changeStatusAction(null, form(fields));

  beforeEach(() => {
    mocks.changeApplicationStatus.mockResolvedValue("changed");
  });

  it("US-3: a failed session read returns a generic message", async () => {
    mocks.tryGetCurrentUserId.mockResolvedValue(null);

    await expect(submit({ id: ID, status: "OFFER" })).resolves.toEqual({
      ok: false,
      error: { message: STATUS_FAILED },
    });
    expect(mocks.changeApplicationStatus).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { id: "" }],
    ["with a NUL byte", { id: "a\0b" }],
  ])("US-0: an id that is %s gets the not-found response", async (_, id) => {
    await expect(submit({ ...id, status: "OFFER" })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(mocks.changeApplicationStatus).not.toHaveBeenCalled();
  });

  it("US-0: a bad id gets the not-found response even with an invalid status", async () => {
    await expect(submit({ status: "ARCHIVED" })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(mocks.changeApplicationStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["not a status", { status: "ARCHIVED" }],
    ["empty", { status: "" }],
  ])("US-3: a status that is %s returns a field error", async (_, status) => {
    await expect(submit({ id: ID, ...status })).resolves.toEqual({
      ok: false,
      error: { fieldErrors: { status: ["Choose a valid status."] } },
    });
    expect(mocks.changeApplicationStatus).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("US-0: a missing or foreign application gets the not-found response", async () => {
    mocks.changeApplicationStatus.mockResolvedValue("not-found");

    await expect(submit({ id: ID, status: "OFFER" })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(console.error).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("US-3: a failed write returns a generic message, logs the real error and never returns it", async () => {
    const error = new Error("connection refused");
    mocks.changeApplicationStatus.mockRejectedValue(error);

    await expect(submit({ id: ID, status: "OFFER" })).resolves.toEqual({
      ok: false,
      error: { message: STATUS_FAILED },
    });
    expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("US-3: the session user's status changes and the page refreshes in place", async () => {
    await expect(submit({ id: ID, status: "OFFER" })).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    expect(mocks.changeApplicationStatus).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      ID,
      "OFFER",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("US-3: a no-op still succeeds and refreshes, so a stale tab catches up", async () => {
    mocks.changeApplicationStatus.mockResolvedValue("unchanged");

    await expect(submit({ id: ID, status: "OFFER" })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("US-0: the owner comes from the session, and a forged userId is ignored", async () => {
    await submit({ id: ID, status: "OFFER", userId: "user-b" });

    expect(mocks.changeApplicationStatus).toHaveBeenCalledExactlyOnceWith(
      OWNER,
      ID,
      "OFFER",
    );
  });
});
