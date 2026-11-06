import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationDetails } from "./application-details";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getApplication: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("../queries", () => ({ getApplication: mocks.getApplication }));
vi.mock("../actions", () => ({
  changeStatusAction: vi.fn(),
  deleteApplicationAction: vi.fn(),
}));

const ID = "application-1";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-a");
  mocks.getApplication.mockResolvedValue({
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
    status: "WISHLIST",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    updatedAt: new Date("2026-11-01T10:00:00Z"),
    statusChanges: [],
  });
});

describe("ApplicationDetails", () => {
  it("US-4: the detail page links to the edit page and offers delete", async () => {
    const html = renderToStaticMarkup(await ApplicationDetails({ id: ID }));

    expect(html).toContain(`href="/applications/${ID}/edit"`);
    expect(html).toContain("Delete permanently");
  });
});
