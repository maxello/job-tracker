import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationList } from "./application-list";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  countApplicationsByStatus: vi.fn(),
  listApplications: vi.fn(),
  hasArchivedApplications: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("../queries", () => ({
  countApplicationsByStatus: mocks.countApplicationsByStatus,
  listApplications: mocks.listApplications,
  hasArchivedApplications: mocks.hasArchivedApplications,
}));
// next/form needs the App Router; a plain form renders the same fields.
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form">) => <form {...props} />,
}));

const ID = "app-acme";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-a");
  mocks.countApplicationsByStatus.mockResolvedValue({
    WISHLIST: 0,
    APPLIED: 1,
    INTERVIEW: 0,
    OFFER: 0,
    REJECTED: 0,
  });
  mocks.listApplications.mockResolvedValue([
    {
      id: ID,
      company: "Acme",
      role: "Engineer",
      status: "APPLIED",
      archivedAt: null,
      updatedAt: new Date("2026-11-10T12:00:00Z"),
    },
  ]);
  mocks.hasArchivedApplications.mockResolvedValue(false);
});

// renderToStaticMarkup can't await async components (the list's Results is
// one), so they are called and awaited here first, as the server would.
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (
    typeof node.type === "function" &&
    node.type.constructor.name === "AsyncFunction"
  ) {
    const render = node.type as (props: unknown) => Promise<ReactNode>;
    return resolve(await render(node.props));
  }
  const { children } = node.props;
  if (children === undefined) return node;
  return cloneElement(
    node,
    undefined,
    ...(await Promise.all(Children.toArray(children).map(resolve))),
  );
}

async function render(searchParams: Record<string, string | string[]>) {
  return renderToStaticMarkup(
    await resolve(
      await ApplicationList({ searchParams: Promise.resolve(searchParams) }),
    ),
  );
}

// The href of the row link to the application.
function rowHref(html: string) {
  return html.match(
    new RegExp(`<a[^>]*href="(/applications/${ID}[^"]*)"`),
  )?.[1];
}

describe("ApplicationList row links", () => {
  it("L1 US-6: a row links to the detail page with the list's validated filters", async () => {
    const html = await render({
      archived: "1",
      tz: "Asia/Tokyo",
      from: "2026-11-01",
      status: ["applied", "foo"],
      q: " acme ",
      next: "https://evil.example",
    });

    expect(rowHref(html)).toBe(
      `/applications/${ID}?q=acme&amp;status=applied&amp;from=2026-11-01&amp;tz=Asia%2FTokyo&amp;archived=1`,
    );
  });

  it("L2 US-6: with no filters a row links to the plain detail page", async () => {
    expect(rowHref(await render({}))).toBe(`/applications/${ID}`);
  });
});
