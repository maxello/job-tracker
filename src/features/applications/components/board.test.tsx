import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BoardApplication } from "../board";
import { STATUS_STYLES } from "../status-style";
import { BoardSkeleton } from "./board";
import { BoardColumns } from "./board-columns";
import { ViewSwitcher } from "./view-switcher";

// The board module also exports Board, which reads the session and the
// database; the skeleton uses neither. The columns import the action.
vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("../queries", () => ({
  listApplications: vi.fn(),
  hasArchivedApplications: vi.fn(),
}));
vi.mock("../actions", () => ({ changeStatusAction: vi.fn() }));

const ACME: BoardApplication = {
  id: "app-acme",
  company: "Acme",
  role: "Frontend Engineer",
  status: "APPLIED",
  updatedAt: "2026-11-10T12:00:00.000Z",
};
const GLOBEX: BoardApplication = {
  id: "app-globex",
  company: "Globex",
  role: "Platform Engineer",
  status: "OFFER",
  updatedAt: "2026-11-09T12:00:00.000Z",
};

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Every element with the given tag: its opening tag and its whole markup.
// Board elements of one tag don't nest, so a lazy match is enough.
function elements(html: string, tag: string) {
  return [
    ...html.matchAll(
      new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)</${tag}>`, "g"),
    ),
  ].map(([outer, open, inner]) => ({
    outer: outer!,
    open: open!,
    inner: inner!,
  }));
}

function attr(openTag: string, name: string) {
  return openTag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

// The draggable card: the <li> that contains the company's name.
function cardOf(html: string, company: string) {
  const card = elements(html, "li").find((li) => li.inner.includes(company));
  expect(card, `a card for ${company}`).toBeDefined();
  return card!;
}

describe("BoardColumns", () => {
  const html = () =>
    renderToStaticMarkup(<BoardColumns applications={[ACME, GLOBEX]} />);

  it("C1 US-5: five column headings with counts, empty columns included, in status order", () => {
    expect(elements(html(), "h2").map(({ inner }) => text(inner))).toEqual([
      "Wishlist · 0",
      "Applied · 1",
      "Interview · 0",
      "Offer · 1",
      "Rejected · 0",
    ]);
  });

  it("C2 US-5: a card shows the company as its only link, the role and the date, with the status edge and no badge", () => {
    const markup = html();
    const card = cardOf(markup, "Acme");

    const links = elements(card.inner, "a");
    expect(links).toHaveLength(1);
    // US-5: view=board makes the detail page link back to the board.
    expect(attr(links[0]!.open, "href")).toBe(
      "/applications/app-acme?view=board",
    );
    expect(text(links[0]!.inner)).toBe("Acme");
    // The card itself isn't inside a link.
    expect(elements(markup, "a").some((a) => a.inner.includes("<li"))).toBe(
      false,
    );

    expect(card.inner).toContain("Frontend Engineer");
    expect(card.inner).toMatch(
      /<time[^>]*datetime="2026-11-10T12:00:00.000Z"/i,
    );

    for (const [status, style] of [
      ["Acme", STATUS_STYLES.APPLIED.panel],
      ["Globex", STATUS_STYLES.OFFER.panel],
    ] as const) {
      const classes = attr(cardOf(markup, status).open, "class") ?? "";
      for (const name of style.split(" ")) expect(classes).toContain(name);
    }
    for (const { badge } of Object.values(STATUS_STYLES)) {
      expect(markup).not.toContain(badge);
    }
  });

  it("C3 US-5: the select is labelled Status and named after the application; Move is named after it too and disabled at first", () => {
    const card = cardOf(html(), "Acme");

    const [select] = elements(card.inner, "select");
    expect(select).toBeDefined();
    expect(attr(select!.open, "aria-label")).toBe(
      "Status for Acme, Frontend Engineer",
    );
    const id = attr(select!.open, "id");
    expect(id).toBeTruthy();
    const [label] = elements(card.inner, "label");
    expect(attr(label!.open, "for")).toBe(id);
    expect(text(label!.inner)).toBe("Status");

    const [button] = elements(card.inner, "button");
    expect(button).toBeDefined();
    expect(text(button!.inner)).toBe("Move");
    expect(attr(button!.open, "aria-label")).toBe(
      "Move Acme, Frontend Engineer",
    );
    expect(button!.open).toMatch(/\sdisabled=""/);
  });

  it("C4 US-5: the card is draggable, its company link isn't on its own", () => {
    const card = cardOf(html(), "Acme");

    expect(attr(card.open, "draggable")).toBe("true");
    expect(attr(elements(card.inner, "a")[0]!.open, "draggable")).toBe("false");
  });
});

describe("BoardSkeleton", () => {
  it("C5 US-5: shows the five column names as visible text, with the loaded board's section and heading classes", () => {
    const skeleton = renderToStaticMarkup(<BoardSkeleton />);
    const loaded = renderToStaticMarkup(<BoardColumns applications={[ACME]} />);

    const headings = elements(skeleton, "h2");
    expect(headings.map(({ inner }) => text(inner))).toEqual([
      "Wishlist",
      "Applied",
      "Interview",
      "Offer",
      "Rejected",
    ]);
    // The name itself isn't hidden: no transparent text around it.
    for (const { open, inner } of headings) {
      expect(open).not.toContain("text-transparent");
      const name = inner.split(text(inner))[0] ?? "";
      expect(name).not.toContain("text-transparent");
    }

    const classes = (html: string, tag: string) =>
      elements(html, tag).map(({ open }) => attr(open, "class"));
    expect(classes(skeleton, "section")).toHaveLength(5);
    expect(classes(skeleton, "section")).toEqual(classes(loaded, "section"));
    expect(classes(skeleton, "h2")).toEqual(classes(loaded, "h2"));
  });
});

describe("ViewSwitcher", () => {
  it.each([
    ["list", "List"],
    ["board", "Board"],
  ] as const)(
    "C6 US-5: a Views nav with List and Board links, current = %s",
    (current, currentName) => {
      const html = renderToStaticMarkup(<ViewSwitcher current={current} />);

      const [nav] = elements(html, "nav");
      expect(nav).toBeDefined();
      expect(attr(nav!.open, "aria-label")).toBe("Views");
      const links = elements(nav!.inner, "a").map(({ open, inner }) => ({
        name: text(inner),
        href: attr(open, "href"),
        current: attr(open, "aria-current"),
      }));
      expect(links).toEqual([
        {
          name: "List",
          href: "/",
          current: currentName === "List" ? "page" : undefined,
        },
        {
          name: "Board",
          href: "/board",
          current: currentName === "Board" ? "page" : undefined,
        },
      ]);
    },
  );
});
