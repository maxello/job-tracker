import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobPostingParser } from "./job-posting-parser";

// The action module reads the session and the database; the markup needs
// neither.
vi.mock("../actions", () => ({ parseJobPostingAction: vi.fn() }));

const NOTICE =
  "The text is sent to Anthropic&#x27;s Claude API to fill in the form. This app doesn&#x27;t store it.";

function render() {
  return renderToStaticMarkup(
    <JobPostingParser>
      <form data-testid="application-form" />
    </JobPostingParser>,
  );
}

// The parse form's markup, without the children.
function parseForm(html: string) {
  const match = html.match(/<form(?![^>]*data-testid)[^>]*>[\s\S]*?<\/form>/);
  return match?.[0] ?? "";
}

describe("JobPostingParser", () => {
  it("JP1 US-7: a heading, the labelled textarea, Parse, and the notice after the textarea that describes it; no checkbox", () => {
    const html = render();

    expect(html).toMatch(/<h2[^>]*id="([^"]+)"[^>]*>Paste a job posting<\/h2>/);
    const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(textarea).toContain('name="text"');
    const textareaId = textarea.match(/\sid="([^"]+)"/)?.[1];
    expect(html).toContain(`<label for="${textareaId}"`);
    expect(html).toMatch(/<label[^>]*>Job posting<\/label>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Parse<\/button>/);

    const notice = html.match(
      new RegExp(`<p[^>]*id="([^"]+)"[^>]*>${NOTICE}</p>`),
    );
    expect(notice).not.toBeNull();
    expect(textarea).toMatch(
      new RegExp(`aria-describedby="[^"]*\\b${notice![1]}\\b`),
    );
    expect(html.indexOf("<textarea")).toBeLessThan(html.indexOf(NOTICE));
    expect(html).not.toContain('type="checkbox"');
  });

  it("JP2 US-7: the parse form sends the browser time zone as a hidden tz input", () => {
    const form = parseForm(render());

    expect(form).toContain('name="text"');
    expect(form).toMatch(/<input[^>]*type="hidden"[^>]*name="tz"/);
  });

  it("JP3 US-7: the block sits above the application form", () => {
    const html = render();

    expect(html).toContain("Paste a job posting");
    expect(html.indexOf("Paste a job posting")).toBeLessThan(
      html.indexOf('data-testid="application-form"'),
    );
  });

  it("JP4 US-7: Parse is disabled until the page has hydrated", () => {
    const html = render();

    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*disabled=""[^>]*>Parse</,
    );
  });
});
