import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { countNumberClass, type StatusCounts } from "../status-counts";
import { countClass } from "./board-styles";
import { PipelineBar } from "./pipeline-bar";

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

// " · " is plain inline text inside the count's span, and only the number
// sits in the 3ch inline-block (SPEC.md US-6).
const COUNT_PART =
  /<span([^>]*)> · <span class="([^"]*)">(\d+)<\/span><\/span>/;

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
    for (const segment of found) expect(segment.className).toContain("min-w-1");
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

    const items = legendItems(html);
    expect(items.map((item) => item.replace(/<[^>]*>/g, ""))).toEqual([
      "Wishlist · 0",
      "Applied · 12",
      "Interview · 0",
      "Offer · 0",
      "Rejected · 0",
    ]);
    for (const item of items) {
      const part = item.match(COUNT_PART);
      expect(part, item).not.toBeNull();
      expect(part![1]).toContain(`class="${countClass}"`);
      expect(part![2]).toBe(countNumberClass);
    }
  });
});
