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

    expect(fieldsets(html).map((f) => f.legend)).toEqual([
      "Status",
      "Updated",
      "Archive",
    ]);
  });

  it("US-8: Show archived is in the Archive fieldset, not in Status", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );
    const byLegend = (legend: string) =>
      fieldsets(html).find((f) => f.legend === legend);
    const status = byLegend("Status");
    const archive = byLegend("Archive");

    expect(status?.body.match(/name="status"/g)).toHaveLength(5);
    expect(status?.body).not.toContain('name="archived"');
    expect(archive?.body).toContain('name="archived"');
  });
});

// US-6 search: a labelled search input at the top of the form.
function searchLabel(html: string) {
  return [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)]
    .map(([, body]) => body!)
    .find((body) => /<input[^>]*name="q"/.test(body));
}

function searchInput(html: string) {
  return html.match(/<input[^>]*name="q"[^>]*>/)?.[0];
}

describe("StatusFilterForm search", () => {
  it('F1 US-6: a search input named q, max 200, labelled "Search company or role", with no placeholder', () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    const label = searchLabel(html);
    expect(label).toBeDefined();
    expect(label!.replace(/<[^>]*>/g, "").trim()).toBe(
      "Search company or role",
    );
    const input = searchInput(html);
    expect(input).toContain('type="search"');
    expect(input).toContain('maxLength="200"');
    expect(input).not.toContain("placeholder");
  });

  it("F2 US-6: the search input comes before the Status fieldset", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    const search = html.search(/<input[^>]*name="q"/);
    expect(search).toBeGreaterThanOrEqual(0);
    expect(search).toBeLessThan(html.indexOf("<fieldset"));
  });

  it.each([
    ["acme", 'value="acme"'],
    [undefined, undefined],
  ])("F3 US-6: search=%j shows the parsed value", (search, value) => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} search={search} />,
    );

    const input = searchInput(html);
    expect(input).toBeDefined();
    if (value) expect(input).toContain(value);
    else expect(input).not.toMatch(/\svalue=/);
  });
});

// US-6 date range: an "Updated" fieldset with From and To, and a hidden tz.
function dateLabel(html: string, name: string) {
  return [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)]
    .map(([, body]) => body!)
    .find((body) => new RegExp(`<input[^>]*name="${name}"`).test(body));
}

function namedInput(html: string, name: string) {
  return html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
}

describe("StatusFilterForm date range", () => {
  it.each([
    ["from", "From"],
    ["to", "To"],
  ])(
    'F4 US-6: a date input named %s, labelled "%s", with no min, max or placeholder, inside the Updated fieldset',
    (name, label) => {
      const html = renderToStaticMarkup(
        <StatusFilterForm selected={[]} showArchived={false} />,
      );

      const updated = fieldsets(html).find((f) => f.legend === "Updated");
      expect(updated).toBeDefined();
      const labelBody = dateLabel(updated!.body, name);
      expect(labelBody).toBeDefined();
      expect(labelBody!.replace(/<[^>]*>/g, "").trim()).toBe(label);
      const input = namedInput(updated!.body, name);
      expect(input).toContain('type="date"');
      expect(input).not.toMatch(/\s(min|max|placeholder)=/);
    },
  );

  it("F5 US-6: the fieldsets come in the order Status, Updated, Archive", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    expect(fieldsets(html).map((f) => f.legend)).toEqual([
      "Status",
      "Updated",
      "Archive",
    ]);
  });

  it.each([
    ["2026-11-01", "2026-11-17"],
    [undefined, undefined],
  ])("F6 US-6: from=%j and to=%j show the parsed values", (from, to) => {
    const html = renderToStaticMarkup(
      <StatusFilterForm
        selected={[]}
        showArchived={false}
        from={from}
        to={to}
      />,
    );

    for (const [name, value] of [
      ["from", from],
      ["to", to],
    ] as const) {
      const input = namedInput(html, name);
      expect(input).toBeDefined();
      if (value) expect(input).toContain(`value="${value}"`);
      else expect(input).not.toMatch(/\svalue=/);
    }
  });

  // The server can't know the browser's zone. Writing its own zone would be
  // wrong and would mismatch on hydration, so the server markup is empty and
  // the browser fills it in (plan, answer 4).
  it("F7 US-6: a hidden tz input whose server-rendered value is empty", () => {
    const html = renderToStaticMarkup(
      <StatusFilterForm selected={[]} showArchived={false} />,
    );

    const input = namedInput(html, "tz");
    expect(input).toBeDefined();
    expect(input).toContain('type="hidden"');
    expect(input).toContain('value=""');
  });
});
