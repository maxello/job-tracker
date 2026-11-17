import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationListSkeleton } from "./application-list";
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
