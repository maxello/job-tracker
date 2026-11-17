import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ApplicationPage from "@/app/(main)/applications/[id]/page";
import { BackLink, parseFrom } from "./back-link";

// The detail page module also loads the details, which read the session and
// the database; the page's fallbacks use neither.
vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("../queries", () => ({ getApplication: vi.fn() }));
vi.mock("../actions", () => ({
  changeStatusAction: vi.fn(),
  deleteApplicationAction: vi.fn(),
  archiveApplicationAction: vi.fn(),
  unarchiveApplicationAction: vi.fn(),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Every <a> in the markup: its href and visible text.
function links(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attrs, inner]) => ({
      href: attrs!.match(/\shref="([^"]*)"/)?.[1],
      text: text(inner!),
      arrow: /<svg[^>]*aria-hidden="true"/.test(inner!),
    }),
  );
}

describe("BackLink", () => {
  it("BL1 US-5: by default it is Applications → / with the arrow", () => {
    expect(links(renderToStaticMarkup(<BackLink />))).toEqual([
      { href: "/", text: "Applications", arrow: true },
    ]);
  });

  it("BL2 US-5: from the board it is Board → /board with the arrow", () => {
    expect(links(renderToStaticMarkup(<BackLink to="board" />))).toEqual([
      { href: "/board", text: "Board", arrow: true },
    ]);
  });
});

describe("parseFrom", () => {
  it("BL3 US-5: only an exact first value of board counts", () => {
    expect(parseFrom("board")).toBe("board");
    expect(parseFrom(["board", "list"])).toBe("board");

    for (const value of [
      undefined,
      "",
      "Board",
      " board",
      "board ",
      "list",
      "https://evil.example",
      ["list", "board"],
      [],
    ]) {
      expect(parseFrom(value), JSON.stringify(value)).toBeUndefined();
    }
  });
});

describe("the detail page's back link fallback", () => {
  // Never settles, so every <Suspense> on the page shows its fallback: what
  // the static shell shows before searchParams streams in.
  const pending = new Promise<never>(() => {});

  it("BL4 US-5: while searchParams is pending, the back link is Applications → /", () => {
    const html = renderToStaticMarkup(
      <ApplicationPage
        params={pending as PageProps<"/applications/[id]">["params"]}
        searchParams={
          pending as PageProps<"/applications/[id]">["searchParams"]
        }
      />,
    );

    expect(links(html)).toEqual([
      { href: "/", text: "Applications", arrow: true },
    ]);
  });
});
