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
