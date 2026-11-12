import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StatusFilterForm } from "./status-filter-form";

// next/form needs the App Router; a plain form renders the same fields.
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form">) => <form {...props} />,
}));

function showArchivedInput(html: string) {
  return html.match(/<input[^>]*name="archived"[^>]*>/)?.[0];
}

describe("StatusFilterForm", () => {
  it("US-8: a Show archived checkbox submits archived=1", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    const input = showArchivedInput(html);
    expect(input).toBeDefined();
    expect(input).toContain('type="checkbox"');
    expect(input).toContain('value="1"');
    expect(html).toContain("Show archived");
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    "US-8: Show archived on=%s renders the checkbox checked=%s",
    (showArchived, checked) => {
      const html = renderToStaticMarkup(
        <StatusFilterForm selected={[]} showArchived={showArchived} />,
      );

      const input = showArchivedInput(html);
      expect(input).toBeDefined();
      if (checked) expect(input).toMatch(/\schecked/);
      else expect(input).not.toMatch(/\schecked/);
    },
  );
});

// Two fieldsets side by side, each with its legend on the border: "Status"
// with the status boxes, "Archive" with "Show archived".
function fieldsets(html: string) {
  return [...html.matchAll(/<fieldset[^>]*>([\s\S]*?)<\/fieldset>/g)].map(
    ([, body]) => ({
      legend: body!.match(/<legend[^>]*>([\s\S]*?)<\/legend>/)?.[1],
      body: body!,
    }),
  );
}

describe("StatusFilterForm groups", () => {
  it("US-8: a Status fieldset and an Archive fieldset, each named by its legend", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    expect(fieldsets(html).map((f) => f.legend)).toEqual(["Status", "Archive"]);
  });

  it("US-8: Show archived is in the Archive fieldset, not in Status", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );
    const [status, archive] = fieldsets(html);

    expect(status?.body.match(/name="status"/g)).toHaveLength(5);
    expect(status?.body).not.toContain('name="archived"');
    expect(archive?.body).toContain('name="archived"');
  });
});
