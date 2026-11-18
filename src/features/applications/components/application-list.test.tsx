import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { countNumberClass } from "../status-counts";
import {
  ApplicationListSkeleton,
  StatusFilterSkeleton,
} from "./application-list";
import { PipelineBarSkeleton } from "./pipeline-bar";
import { StatusFilterForm } from "./status-filter-form";

// The module also exports the list, which reads the session and the database;
// the skeleton uses neither.
vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("../queries", () => ({
  listApplications: vi.fn(),
  hasArchivedApplications: vi.fn(),
}));
// next/form needs the App Router; a plain form renders the same fields.
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form">) => <form {...props} />,
}));

function legends(html: string) {
  return [...html.matchAll(/<legend[^>]*>([\s\S]*?)<\/legend>/g)].map(
    ([, body]) => body!.replace(/<[^>]*>/g, "").trim(),
  );
}

describe("ApplicationListSkeleton", () => {
  // US-6: the skeleton keeps the filter column's positions, so it has the
  // same fieldsets in the same order as the form (pixel positions are a
  // manual check).
  it("S1 US-6: the skeleton's fieldsets match the form's, including Updated", () => {
    const skeleton = legends(renderToStaticMarkup(<ApplicationListSkeleton />));
    const form = legends(
      renderToStaticMarkup(
        <StatusFilterForm selected={[]} showArchived={false} />,
      ),
    );

    expect(skeleton).toEqual(["Status", "Updated", "Archive"]);
    expect(skeleton).toEqual(form);
  });
});

// US-6 skeleton (SPEC.md decision log, 2026-11-18): static labels are visible
// real text, only data-dependent parts pulse, and the skeleton stays hidden
// from assistive technology.
const FILTER_WORDS = [
  "Search company or role",
  "Status",
  "Wishlist",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Updated",
  "From",
  "To",
  "Archive",
  "Show archived",
  "Clear",
  "Apply",
];
const STATUS_NAMES = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];

// A word as a text node: right after a tag and right before the next one.
function hasText(html: string, word: string) {
  return html.includes(`>${word}<`);
}

describe("ApplicationListSkeleton labels and counts", () => {
  it("S2 US-6: the filter and the pipeline legend show their static labels as visible text, inside aria-hidden roots", () => {
    const filter = renderToStaticMarkup(<StatusFilterSkeleton />);
    const pipeline = renderToStaticMarkup(<PipelineBarSkeleton />);

    expect.soft(filter, "filter root").toMatch(/^<div[^>]*aria-hidden="true"/);
    expect
      .soft(pipeline, "legend root")
      .toMatch(/^<div[^>]*aria-hidden="true"/);
    for (const word of FILTER_WORDS) {
      expect.soft(hasText(filter, word), `filter: ${word}`).toBe(true);
    }
    for (const word of STATUS_NAMES) {
      expect.soft(hasText(pipeline, word), `legend: ${word}`).toBe(true);
    }
    expect.soft(filter).not.toContain("text-transparent");
    expect.soft(pipeline).not.toContain("text-transparent");
  });

  it("S3 US-6: the skeleton has the bar and pulses only the numbers of ten counts: five after a real ' · ' in the legend, five at the end of the status rows", () => {
    const html = renderToStaticMarkup(<ApplicationListSkeleton />);

    expect(html).toMatch(/data-skeleton="bar"/);
    const legend = [...html.matchAll(/ · <span class="([^"]*)"><\/span>/g)].map(
      ([, className]) => className!,
    );
    const rows = [
      ...html.matchAll(
        /<span class="([^"]*\bml-auto\b[^"]*\btabular-nums\b[^"]*)"><span class="([^"]*)"><\/span><\/span>/g,
      ),
    ].map(([, , className]) => className!);
    expect(legend).toHaveLength(5);
    expect(rows).toHaveLength(5);
    for (const className of [...legend, ...rows]) {
      expect(className).toContain(countNumberClass);
      expect(className).toContain("animate-pulse");
    }
  });
});
