import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationForm } from "./application-form";

const action = vi.fn();

const values = {
  company: "Acme",
  role: "Engineer",
  url: "https://example.com/jobs/1",
  notes: "Some notes",
  location: "Kyiv",
  level: "Senior",
  stack: "React, Node",
  salaryMin: "1000",
  salaryMax: "2000",
  salaryCurrency: "USD",
};

describe("ApplicationForm", () => {
  it("US-1: the create form starts empty and has no id", () => {
    const html = renderToStaticMarkup(
      <ApplicationForm
        action={action}
        submitLabel="Save application"
        cancelHref="/"
      />,
    );

    expect(html).not.toContain('name="id"');
    expect(html).toMatch(/<input[^>]*name="company"[^>]*value=""/);
    expect(html).toContain("Save application");
    expect(html).toContain('href="/"');
  });

  it("US-4: the edit form is pre-filled and carries the application id", () => {
    const html = renderToStaticMarkup(
      <ApplicationForm
        action={action}
        id="application-1"
        initialValues={values}
        submitLabel="Save changes"
        cancelHref="/applications/application-1"
      />,
    );

    expect(html).toMatch(/<input[^>]*name="id"[^>]*value="application-1"/);
    for (const name of [
      "company",
      "role",
      "url",
      "location",
      "level",
      "stack",
      "salaryMin",
      "salaryMax",
      "salaryCurrency",
    ] as const) {
      expect(html).toMatch(
        new RegExp(`<input[^>]*name="${name}"[^>]*value="${values[name]}"`),
      );
    }
    expect(html).toContain(">Some notes</textarea>");
    expect(html).toContain("Save changes");
    expect(html).toContain('href="/applications/application-1"');
  });

  it("US-4: the form has no status field", () => {
    const html = renderToStaticMarkup(
      <ApplicationForm
        action={action}
        id="application-1"
        initialValues={values}
        submitLabel="Save changes"
        cancelHref="/applications/application-1"
      />,
    );

    expect(html).not.toContain('name="status"');
  });
});
