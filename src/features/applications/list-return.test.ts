import { describe, expect, it } from "vitest";
import {
  listReturnHref,
  listReturnQuery,
  parseListReturn,
  parseListReturnQuery,
  type ListReturn,
} from "./list-return";

const LIST: ListReturn = { view: "list", statuses: [], showArchived: false };

// The canonical query for the given URL parameters.
const query = (params: Record<string, string | string[] | undefined>) =>
  listReturnQuery(parseListReturn(params));

describe("parseListReturn and listReturnQuery", () => {
  it("LR1 US-6: no parameters is the unfiltered list, / with no query", () => {
    const target = parseListReturn({});

    expect(target).toEqual(LIST);
    expect(listReturnQuery(target)).toBe("");
    expect(listReturnHref(target)).toBe("/");
  });

  it("LR2 US-6: every filter is kept, in the filter form's order", () => {
    const target = parseListReturn({
      archived: "1",
      tz: "Asia/Tokyo",
      to: "2026-11-30",
      from: "2026-11-01",
      status: ["offer", "applied"],
      q: "acme",
    });

    expect(target).toEqual({
      view: "list",
      statuses: ["APPLIED", "OFFER"],
      showArchived: true,
      q: "acme",
      from: "2026-11-01",
      to: "2026-11-30",
      tz: "Asia/Tokyo",
    });
    expect(listReturnQuery(target)).toBe(
      "?q=acme&status=applied&status=offer&from=2026-11-01&to=2026-11-30&tz=Asia%2FTokyo&archived=1",
    );
    expect(listReturnHref(target)).toBe(
      "/?q=acme&status=applied&status=offer&from=2026-11-01&to=2026-11-30&tz=Asia%2FTokyo&archived=1",
    );
  });

  it("LR3 US-6: values are trimmed, statuses deduplicated, and only the first q, from, to and tz count", () => {
    expect(
      query({
        q: [" acme ", "globex"],
        status: [" APPLIED ", "applied"],
        from: ["2026-11-01 ", "2026-11-02"],
        to: [" 2026-11-30", "2026-12-01"],
        tz: [" Asia/Tokyo ", "Europe/Kyiv"],
        archived: [" 1 "],
      }),
    ).toBe(
      "?q=acme&status=applied&from=2026-11-01&to=2026-11-30&tz=Asia%2FTokyo&archived=1",
    );
  });

  it("LR4 US-6: invalid and unknown parameters are dropped, never an error", () => {
    const long = "a".repeat(201);
    for (const params of [
      { q: "" },
      { q: "   " },
      { q: long },
      { q: "a\0b" },
      { q: ["", "acme"] },
      { status: "foo" },
      { from: "board" },
      { from: "2026-02-30" },
      { to: "17.11.2026" },
      { tz: "Foo/Bar" },
      { tz: "" },
      { tz: "Asia/Tokyo\0" },
      { archived: "yes" },
      { view: "list" },
      { next: "https://evil.example", returnTo: "//evil.example" },
    ]) {
      expect(query(params), JSON.stringify(params)).toBe("");
    }
  });

  it("LR5 US-6: a valid tz is kept also without dates", () => {
    expect(query({ tz: "Asia/Tokyo" })).toBe("?tz=Asia%2FTokyo");
    expect(query({ tz: " utc " })).toBe("?tz=utc");
    expect(query({ tz: "+02:00" })).toBe("?tz=%2B02%3A00");
  });

  it("LR6 US-5: an exact first view=board wins over every list filter", () => {
    const target = parseListReturn({
      view: ["board", "list"],
      q: "acme",
      status: "applied",
      archived: "1",
    });

    expect(target).toEqual({ view: "board" });
    expect(listReturnQuery(target)).toBe("?view=board");
    expect(listReturnHref(target)).toBe("/board");

    for (const view of ["Board", " board", "board ", "", ["list", "board"]]) {
      expect(
        parseListReturn({ view, q: "acme" }),
        JSON.stringify(view),
      ).toEqual({ ...LIST, q: "acme" });
    }
  });

  it("LR7 US-6: search text is encoded, so it can't add parameters", () => {
    const target = parseListReturn({ q: "a&status=offer#x y" });

    expect(target).toEqual({ ...LIST, q: "a&status=offer#x y" });
    expect(listReturnQuery(target)).toBe("?q=a%26status%3Doffer%23x+y");
  });
});

describe("parseListReturnQuery", () => {
  it("LR8 US-6: a submitted query is parsed again with the same rules", () => {
    expect(
      parseListReturnQuery(
        "?q=%20acme%20&status=APPLIED&status=foo&from=board",
      ),
    ).toEqual({ ...LIST, statuses: ["APPLIED"], q: "acme" });
    expect(parseListReturnQuery("q=acme&archived=1")).toEqual({
      ...LIST,
      showArchived: true,
      q: "acme",
    });
    expect(parseListReturnQuery("?view=board&q=acme")).toEqual({
      view: "board",
    });
  });

  it("LR9 US-6: anything else is the unfiltered list, so the path stays /", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "https://evil.example/?q=acme",
      new File(["q=acme"], "return.txt"),
    ]) {
      const target = parseListReturnQuery(raw);
      expect(target, String(raw)).toEqual(LIST);
      expect(listReturnHref(target)).toBe("/");
    }
  });
});
