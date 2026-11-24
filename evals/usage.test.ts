import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { costOf, PRICES_CHECKED, watchUsage } from "./usage";

// `npm test` never reaches the network: the real fetch is always replaced.
const fake = vi.fn<typeof fetch>();
let watch: ReturnType<typeof watchUsage>;

beforeEach(() => {
  fake.mockReset();
  fake.mockRejectedValue(new Error("no network in tests"));
  vi.stubGlobal("fetch", fake);
  watch = watchUsage();
});

afterEach(() => {
  watch.restore();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const call = () => fetch("https://api.anthropic.com/v1/messages");

describe("watchUsage (US-7 eval)", () => {
  it("sums the tokens of every attempt and leaves the body readable", async () => {
    const first = { usage: { input_tokens: 100, output_tokens: 20 } };
    const second = { usage: { input_tokens: 7, output_tokens: 3 } };
    fake.mockResolvedValueOnce(json(first)).mockResolvedValueOnce(json(second));

    expect(await (await call()).json()).toEqual(first);
    expect(await (await call()).json()).toEqual(second);

    expect(await watch.settle()).toEqual({
      input: 107,
      output: 23,
      unknown: 0,
    });
  });

  it("gives the usage since the last settle", async () => {
    fake.mockImplementation(async () =>
      json({ usage: { input_tokens: 1, output_tokens: 2 } }),
    );
    await call();
    await watch.settle();
    await call();
    await call();
    expect(await watch.settle()).toEqual({ input: 2, output: 4, unknown: 0 });
  });

  it.each([
    ["an abort", () => new DOMException("aborted", "AbortError")],
    ["another error", () => new TypeError("fetch failed")],
  ])("counts a fetch rejected by %s as unknown usage", async (_name, error) => {
    fake.mockRejectedValueOnce(error());
    await expect(call()).rejects.toThrow();
    expect(await watch.settle()).toEqual({ input: 0, output: 0, unknown: 1 });
  });

  it("counts a body that fails after the headers as unknown usage", async () => {
    fake.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new DOMException("aborted", "AbortError"));
          },
        }),
      ),
    );
    const response = await call();
    await expect(response.json()).rejects.toThrow();
    expect(await watch.settle()).toEqual({ input: 0, output: 0, unknown: 1 });
  });

  it.each([
    ["isn't JSON", () => new Response("not json")],
    ["has no usage", () => json({ id: "msg" })],
    [
      "has usage without numbers",
      () => json({ usage: { input_tokens: "1", output_tokens: null } }),
    ],
    ["is null", () => json(null)],
  ])("counts a 2xx body that %s as unknown usage", async (_name, response) => {
    fake.mockResolvedValueOnce(response());
    await call();
    expect(await watch.settle()).toEqual({ input: 0, output: 0, unknown: 1 });
  });

  it.each([400, 429, 500])(
    "counts nothing for an HTTP %i response",
    async (status) => {
      fake
        .mockResolvedValueOnce(json({ error: {} }, status))
        .mockResolvedValueOnce(
          json({ usage: { input_tokens: 5, output_tokens: 6 } }),
        );
      await call();
      await call();
      expect(await watch.settle()).toEqual({ input: 5, output: 6, unknown: 0 });
    },
  );

  it("puts the original fetch back", () => {
    expect(globalThis.fetch).not.toBe(fake);
    watch.restore();
    expect(globalThis.fetch).toBe(fake);
  });
});

describe("costOf (US-7 eval)", () => {
  const usage = { input: 1_000_000, output: 2_000_000, unknown: 0 };

  it.each([
    ["claude-haiku-5-5", 1.1],
    ["claude-sonnet-5-5", 22],
  ])("prices %s", (model, cost) => {
    expect(costOf(model, usage)).toBeCloseTo(cost, 10);
  });

  it("gives null for an unknown model", () => {
    expect(costOf("some-other-model", usage)).toBeNull();
  });

  it("says when the prices were checked", () => {
    expect(PRICES_CHECKED).toBe("2026-11-23");
  });
});
