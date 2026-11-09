import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedirectIfSignedIn } from "./redirect-if-signed-in";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("../queries", () => ({ getSession: mocks.getSession }));
// The real unstable_rethrow, so Next's internal errors are recognized as in a
// build.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
}));

class RedirectSignal extends Error {}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new RedirectSignal();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RedirectIfSignedIn", () => {
  it("redirects a signed-in user to /", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" } });

    await expect(RedirectIfSignedIn()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("renders nothing and doesn't redirect without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(RedirectIfSignedIn()).resolves.toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders nothing, logs and doesn't redirect when the session read fails", async () => {
    const error = new Error("database down");
    mocks.getSession.mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(RedirectIfSignedIn()).resolves.toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "Failed to read the session",
      error,
    );
  });

  it("rethrows Next's prerender signal from headers() instead of logging it", async () => {
    const signal = Object.assign(new Error("prerender complete"), {
      digest: "HANGING_PROMISE_REJECTION",
    });
    mocks.getSession.mockRejectedValue(signal);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(RedirectIfSignedIn()).rejects.toBe(signal);
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
