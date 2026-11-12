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
  archiveApplicationAction: vi.fn(),
  unarchiveApplicationAction: vi.fn(),
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
    archivedAt: null,
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

  it("US-8: an active application offers Archive and has no Archived badge", async () => {
    const html = renderToStaticMarkup(await ApplicationDetails({ id: ID }));

    expect(html).toMatch(/<button[^>]*>Archive<\/button>/);
    expect(html).not.toContain(">Archived<");
    expect(html).not.toContain(">Unarchive<");
  });

  it("US-8: an archived application shows the Archived badge, offers Unarchive and stays editable", async () => {
    mocks.getApplication.mockResolvedValue({
      ...(await mocks.getApplication()),
      archivedAt: new Date("2026-11-10T10:00:00Z"),
    });

    const html = renderToStaticMarkup(await ApplicationDetails({ id: ID }));

    expect(html).toContain(">Archived<");
    expect(html).toMatch(/<button[^>]*>Unarchive<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>Archive<\/button>/);
    // Still editable: the edit link, delete and the status form.
    expect(html).toContain(`href="/applications/${ID}/edit"`);
    expect(html).toContain("Delete permanently");
    expect(html).toContain('name="status"');
  });
});
