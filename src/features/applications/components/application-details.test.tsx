import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationDetails,
  ApplicationDetailsSkeleton,
} from "./application-details";

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

// The detail skeleton (SPEC.md decision log, 2026-11-19): static labels are
// visible real text, only data pulses, fake controls can't be focused or
// labelled, and a screen reader hears "Loading application" outside the
// aria-hidden visual root.
const DETAIL_WORDS = [
  "Edit",
  "Archive",
  "Delete",
  "Status",
  "Update status",
  "Job URL",
  "Location",
  "Level",
  "Stack",
  "Salary (annual gross)",
  "Notes",
  "Created",
  "Last updated",
  "Status history",
];

// A word as a text node: right after a tag and right before the next one.
function hasText(html: string, word: string) {
  return html.includes(`>${word}<`);
}

function terms(html: string) {
  return [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/g)].map(([, body]) =>
    body!.replace(/<[^>]*>/g, "").trim(),
  );
}

// Elements and attributes a fake control must not have: preserved-routes
// looks up `main label` and checks ids are unique, and nothing in a skeleton
// takes focus.
const FORBIDDEN = [
  /<label\b/,
  /\sid="/,
  /<a\b/,
  /<button\b/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
  /tabindex/i,
];

describe("ApplicationDetailsSkeleton", () => {
  it("D1 US-4: the skeleton shows its static labels as visible text; only the select's value is transparent", () => {
    const html = renderToStaticMarkup(<ApplicationDetailsSkeleton />);

    for (const word of DETAIL_WORDS) {
      expect.soft(hasText(html, word), `text: ${word}`).toBe(true);
    }
    const transparent = [
      ...html.matchAll(/class="[^"]*\btext-transparent\b[^"]*">([^<]*)</g),
    ].map(([, text]) => text);
    expect.soft(transparent, "transparent words").toEqual(["Wishlist"]);
  });

  it("D2 US-4: the skeleton's field labels match the loaded page's, in order", async () => {
    const skeleton = terms(renderToStaticMarkup(<ApplicationDetailsSkeleton />));
    const loaded = terms(
      renderToStaticMarkup(await ApplicationDetails({ id: ID })),
    );

    expect(loaded).toHaveLength(8);
    expect(skeleton).toEqual(loaded);
  });

  it("D3 US-4: no fake control can be labelled or focused, and 'Loading application' sits outside the aria-hidden root", () => {
    const html = renderToStaticMarkup(<ApplicationDetailsSkeleton />);

    for (const pattern of FORBIDDEN) {
      expect.soft(html, `no ${pattern}`).not.toMatch(pattern);
    }
    expect.soft(html, "no aria-label or aria-busy").not.toMatch(
      /aria-(label|busy)=/,
    );
    expect
      .soft(html, "sr-only text, then the aria-hidden visual root")
      .toMatch(
        /^<div><span class="sr-only">Loading application<\/span><div aria-hidden="true"/,
      );
  });
});

describe("ApplicationDetails Edit link", () => {
  it("D1 US-6: the Edit link keeps the list's filters", async () => {
    const html = renderToStaticMarkup(
      await ApplicationDetails({
        id: ID,
        returnTo: {
          view: "list",
          statuses: ["OFFER"],
          showArchived: false,
          q: "acme",
          tz: "Asia/Tokyo",
        },
      }),
    );

    expect(html).toContain(
      `href="/applications/${ID}/edit?q=acme&amp;status=offer&amp;tz=Asia%2FTokyo"`,
    );
  });

  it("D2 US-5: opened from the board, the Edit link keeps view=board", async () => {
    const html = renderToStaticMarkup(
      await ApplicationDetails({ id: ID, returnTo: { view: "board" } }),
    );

    expect(html).toContain(`href="/applications/${ID}/edit?view=board"`);
  });
});
