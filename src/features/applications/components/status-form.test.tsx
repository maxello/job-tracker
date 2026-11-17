import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusForm } from "./status-form";

const mocks = vi.hoisted(() => ({
  useActionState: vi.fn(),
  notFound: vi.fn(),
}));

// The action's state is the only input that matters here, so useActionState
// returns it directly; everything else in React stays real.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: mocks.useActionState,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../actions", () => ({ changeStatusAction: vi.fn() }));

// Like the real notFound, it throws, so rendering stops.
class NotFoundSignal extends Error {}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw new NotFoundSignal();
  });
});

function renderWithState(state: unknown) {
  mocks.useActionState.mockReturnValue([state, vi.fn(), false]);
  return () =>
    renderToStaticMarkup(<StatusForm id="application-1" status="WISHLIST" />);
}

describe("StatusForm", () => {
  it("SF1 US-5: a not-found result from the action shows the not-found UI while rendering", () => {
    expect(renderWithState({ ok: false, error: { notFound: true } })).toThrow(
      NotFoundSignal,
    );
  });

  it("SF1 US-3: no result yet renders the form", () => {
    expect(renderWithState(null)()).toContain("Update status");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("SF1 US-3: a field error renders next to the select, not the not-found UI", () => {
    const html = renderWithState({
      ok: false,
      error: { fieldErrors: { status: ["Choose a valid status."] } },
    })();

    expect(html).toContain("Choose a valid status.");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
