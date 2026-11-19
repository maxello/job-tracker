import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditApplicationForm } from "./edit-application-form";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getApplication: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("../queries", () => ({ getApplication: mocks.getApplication }));
vi.mock("../actions", () => ({ updateApplicationAction: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const OWNER = "user-a";
const ID = "application-1";

class NotFoundSignal extends Error {}

const application = {
  id: ID,
  company: "Acme",
  role: "Engineer",
  url: null,
  notes: null,
  location: null,
  level: null,
  stack: [],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUserId.mockResolvedValue(OWNER);
  mocks.getApplication.mockResolvedValue(application);
  mocks.notFound.mockImplementation(() => {
    throw new NotFoundSignal();
  });
});

describe("EditApplicationForm", () => {
  it("US-4: the form shows the owner's application and cancels to its detail page", async () => {
    const html = renderToStaticMarkup(await EditApplicationForm({ id: ID }));

    expect(mocks.getApplication).toHaveBeenCalledExactlyOnceWith(OWNER, ID);
    expect(html).toMatch(/<input[^>]*name="company"[^>]*value="Acme"/);
    expect(html).toContain(`href="/applications/${ID}"`);
  });

  it("US-0: a missing or foreign application gets the not-found response", async () => {
    mocks.getApplication.mockResolvedValue(null);

    await expect(EditApplicationForm({ id: ID })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );
  });

  it("US-0: an unusable id gets the not-found response without a query", async () => {
    await expect(EditApplicationForm({ id: "a\0b" })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );

    expect(mocks.getApplication).not.toHaveBeenCalled();
  });
});

describe("EditApplicationForm with the list's filters", () => {
  // The hidden input that carries the filters to the action.
  const returnInputs = (html: string) =>
    [...html.matchAll(/<input[^>]*name="return"[^>]*>/g)].map(
      ([input]) => input.match(/\svalue="([^"]*)"/)?.[1],
    );

  it("E1 US-6: Cancel and the hidden return input keep the list's filters", async () => {
    const html = renderToStaticMarkup(
      await EditApplicationForm({
        id: ID,
        returnTo: {
          view: "list",
          statuses: ["APPLIED"],
          showArchived: true,
          q: "acme",
        },
      }),
    );

    expect(html).toContain(
      `href="/applications/${ID}?q=acme&amp;status=applied&amp;archived=1"`,
    );
    expect(returnInputs(html)).toEqual([
      "?q=acme&amp;status=applied&amp;archived=1",
    ]);
  });

  it("E2 US-5: from the board, Cancel and the return input keep view=board", async () => {
    const html = renderToStaticMarkup(
      await EditApplicationForm({ id: ID, returnTo: { view: "board" } }),
    );

    expect(html).toContain(`href="/applications/${ID}?view=board"`);
    expect(returnInputs(html)).toEqual(["?view=board"]);
  });

  it("E3 US-6: with no filters there is no return input", async () => {
    const html = renderToStaticMarkup(await EditApplicationForm({ id: ID }));

    // Paired with E1: the same locator finds the input when there are filters.
    expect(html).toMatch(/<input[^>]*name="id"/);
    expect(returnInputs(html)).toEqual([]);
  });
});
