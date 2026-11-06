import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeleteApplication } from "./delete-application";

vi.mock("../actions", () => ({ deleteApplicationAction: vi.fn() }));

const render = () =>
  renderToStaticMarkup(
    <DeleteApplication id="application-1" name="Acme, Engineer" />,
  );

describe("DeleteApplication", () => {
  it("US-4: the Delete trigger only opens the dialog, it can't submit", () => {
    expect(render()).toMatch(/^<button type="button"[^>]*>Delete<\/button>/);
  });

  // A closed <dialog> isn't displayed, so nothing can be submitted from it
  // before hydration.
  it("US-4: the delete form exists only inside a closed dialog", () => {
    const html = render();
    const dialog = html.match(/<dialog[^>]*>[\s\S]*<\/dialog>/)?.[0] ?? "";

    expect(dialog).not.toBe("");
    expect(dialog).not.toMatch(/^<dialog[^>]*\sopen/);
    expect(dialog).toMatch(/<input[^>]*name="id"[^>]*value="application-1"/);
    expect(html.replace(dialog, "")).not.toContain("<form");
  });

  it("US-4: the dialog names the application and offers Cancel first", () => {
    const html = render();

    expect(html).toContain("Acme, Engineer");
    expect(html.indexOf(">Cancel<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Cancel<")).toBeLessThan(
      html.indexOf(">Delete permanently<"),
    );
  });
});
