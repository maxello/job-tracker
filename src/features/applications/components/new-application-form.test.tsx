import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationForm } from "./application-form";
import { NewApplicationFormSkeleton } from "./new-application-form";

// The module also exports the form, which reads the session; the skeleton
// uses neither the session nor the actions.
vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("../actions", () => ({ createApplicationAction: vi.fn() }));

// The form skeleton (SPEC.md decision log, 2026-11-19), used by the new and
// edit pages: every static label is visible real text, the new form's
// fields are empty except the static placeholders, the edit form's values
// pulse, fake controls can't be labelled or focused, and a screen reader
// hears "Loading form" outside the aria-hidden visual root.

const text = (html: string) => html.replace(/<[^>]*>/g, "");

// The loaded form's labels and legend, in document order ("Company *").
function formLabels() {
  const html = renderToStaticMarkup(
    <ApplicationForm
      action={vi.fn()}
      submitLabel="Save application"
      cancelHref="/"
    />,
  );
  return [...html.matchAll(/<(label|legend)[^>]*>([\s\S]*?)<\/\1>/g)].map(
    ([, , body]) => text(body!).trim(),
  );
}

const pulses = (html: string) => html.match(/\banimate-pulse\b/g)?.length ?? 0;

// Elements and attributes a fake control must not have: preserved-routes
// looks up `main label` and checks ids are unique, and nothing in a skeleton
// takes focus.
const FORBIDDEN = [
  /<label\b/,
  /\sid="/,
  /<a\b/,
  /<button\b/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
  /tabindex/i,
];

describe("NewApplicationFormSkeleton", () => {
  it("F1 US-1: the skeleton shows the form's labels and legend in order, the required note, the hint, the buttons and the static placeholders", () => {
    const shown = text(
      renderToStaticMarkup(<NewApplicationFormSkeleton mode="new" />),
    );
    const labels = formLabels();

    expect(labels).toHaveLength(11);
    let from = 0;
    for (const label of labels) {
      const at = shown.indexOf(label, from);
      expect.soft(at, `label in order: ${label}`).toBeGreaterThanOrEqual(0);
      if (at >= 0) from = at + label.length;
    }
    for (const word of [
      "Fields marked * are required.",
      "Comma-separated, e.g. React, Node",
      "https://",
      "USD",
      "Save application",
      "Cancel",
    ]) {
      expect.soft(shown, `text: ${word}`).toContain(word);
    }
  });

  it("F2 US-4: in edit mode the submit says Save changes and the ten values pulse; the new form pulses nothing", () => {
    const edit = renderToStaticMarkup(
      <NewApplicationFormSkeleton mode="edit" />,
    );
    const created = renderToStaticMarkup(
      <NewApplicationFormSkeleton mode="new" />,
    );

    expect.soft(text(edit), "edit: Save changes").toContain("Save changes");
    expect
      .soft(text(edit), "edit: no create label")
      .not.toContain("Save application");
    expect.soft(text(edit), "edit: Cancel").toContain("Cancel");
    expect.soft(pulses(edit), "edit: value pulses").toBe(10);
    expect
      .soft(text(edit), "edit: no placeholders")
      .not.toMatch(/https:\/\/|USD/);
    expect
      .soft(text(created), "new: Save application")
      .toContain("Save application");
    expect.soft(pulses(created), "new: no pulses").toBe(0);
  });

  it("F3 US-1: no fake control can be labelled or focused, and 'Loading form' sits outside the aria-hidden root", () => {
    for (const mode of ["new", "edit"] as const) {
      const html = renderToStaticMarkup(
        <NewApplicationFormSkeleton mode={mode} />,
      );

      for (const pattern of FORBIDDEN) {
        expect.soft(html, `${mode}: no ${pattern}`).not.toMatch(pattern);
      }
      expect
        .soft(html, `${mode}: no aria-label or aria-busy`)
        .not.toMatch(/aria-(label|busy)=/);
      expect
        .soft(html, `${mode}: sr-only text, then the aria-hidden visual root`)
        .toMatch(
          /^<div><span class="sr-only">Loading form<\/span><div aria-hidden="true"/,
        );
    }
  });
});
