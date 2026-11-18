import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StatusCounts } from "../status-counts";
import { legendNumberClass, PipelineBar } from "./pipeline-bar";

const ZERO: StatusCounts = {
  WISHLIST: 0,
  APPLIED: 0,
  INTERVIEW: 0,
  OFFER: 0,
  REJECTED: 0,
};

// The decorative bar: the element marked data-pipeline-bar, up to its first
// closing tag sequence for the bar (segments are empty spans).
function bar(html: string) {
  return html.match(/<div[^>]*data-pipeline-bar[^>]*>([\s\S]*?)<\/div>/);
}

function segments(html: string) {
  const body = bar(html)?.[1] ?? "";
  return [...body.matchAll(/<span([^>]*)><\/span>/g)].map(([, attrs]) => ({
    className: attrs!.match(/class="([^"]*)"/)?.[1] ?? "",
    style: attrs!.match(/style="([^"]*)"/)?.[1] ?? "",
  }));
}

function legendItems(html: string) {
  const list = html.match(
    /<ul[^>]*aria-label="Pipeline"[^>]*>([\s\S]*?)<\/ul>/,
  )?.[1];
  return [...(list ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(
    ([, body]) => body!,
  );
}

// The number first, alone in its span, then a space and the name in its own
// span, with no separator (SPEC.md US-6).
const COUNT_PART = /<span class="([^"]*)">(\d+)<\/span> <span>([^<]+)<\/span>$/;

describe("PipelineBar", () => {
  it("P1 US-6: renders nothing when every count is 0", () => {
    expect(renderToStaticMarkup(<PipelineBar counts={ZERO} />)).toBe("");
  });

  it("P2 US-6: one segment per status above 0, Wishlist → Rejected, each flex {count} 1 0 with a minimum width", () => {
    const html = renderToStaticMarkup(
      <PipelineBar
        counts={{ ...ZERO, REJECTED: 1, WISHLIST: 2, INTERVIEW: 5 }}
      />,
    );
    const found = segments(html);

    expect(found.map((s) => s.className.match(/bg-(\w+)/)?.[1])).toEqual([
      "wishlist",
      "interview",
      "rejected",
    ]);
    expect(found.map((s) => s.style)).toEqual([
      "flex:2 1 0",
      "flex:5 1 0",
      "flex:1 1 0",
    ]);
    for (const segment of found) expect(segment.className).toContain("min-w-2");
  });

  it("P3 US-6: a single status gives a single segment", () => {
    const html = renderToStaticMarkup(
      <PipelineBar counts={{ ...ZERO, OFFER: 4 }} />,
    );

    expect(segments(html).map((s) => s.style)).toEqual(["flex:4 1 0"]);
  });

  it("P4 US-6: the bar is aria-hidden, and the Pipeline legend lists all five with their counts, including 0", () => {
    const html = renderToStaticMarkup(
      <PipelineBar counts={{ ...ZERO, APPLIED: 12 }} />,
    );

    expect(bar(html)?.[0]).toMatch(/^<div[^>]*aria-hidden="true"/);

    // The whole legend is mono and muted; only the number is in the text
    // colour.
    const legendClass =
      html.match(/<ul[^>]*aria-label="Pipeline"[^>]*class="([^"]*)"/)?.[1] ??
      "";
    expect(legendClass.split(" ")).toEqual(
      expect.arrayContaining(["font-mono", "text-xs", "text-muted"]),
    );

    const items = legendItems(html);
    expect(items.map((item) => item.replace(/<[^>]*>/g, ""))).toEqual([
      "0 Wishlist",
      "12 Applied",
      "0 Interview",
      "0 Offer",
      "0 Rejected",
    ]);
    for (const item of items) {
      const part = item.match(COUNT_PART);
      expect(part, item).not.toBeNull();
      expect(part![1]).toBe(legendNumberClass);
      expect(part![1]!.split(" ")).toEqual(
        expect.arrayContaining(["min-w-[1ch]", "font-medium", "text-text"]),
      );
    }
  });
});
