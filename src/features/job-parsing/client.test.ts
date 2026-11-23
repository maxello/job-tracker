import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestParse } from "./client";

// Runs before the imports above, so the module loads with its env set; only
// the import test below loads it without.
vi.hoisted(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("PARSE_MODEL", "test-model");
});

// The SDK is mocked: tests never call the real API. Only the client class is
// replaced; the error classes are the real ones, so `instanceof` works.
const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", async (importActual) => {
  const actual = await importActual<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { create };
  }
  return { ...actual, default: FakeAnthropic, Anthropic: FakeAnthropic };
});

const TEXT = "Senior Frontend Engineer at Acme, Kyiv. React, TypeScript.";
const BUDGET_MS = 30_000;

const output = {
  isJobPosting: true,
  company: "Acme",
  role: "Senior Frontend Engineer",
  location: "Kyiv",
  level: "Senior",
  stack: ["React", "TypeScript"],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

function message(stop_reason: string, content: Array<Record<string, unknown>>) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content,
    stop_reason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

const textBlock = (text: string) => ({ type: "text", text, citations: null });
const thinkingBlock = { type: "thinking", thinking: "", signature: "sig" };

const validMessage = message("end_turn", [textBlock(JSON.stringify(output))]);
const invalidJsonMessage = message("end_turn", [textBlock('{"isJobPosting":')]);
const invalidSchemaMessage = message("end_turn", [
  textBlock(JSON.stringify({ isJobPosting: "yes" })),
]);

const headers = new Headers();

function run(signal = new AbortController().signal) {
  return requestParse(TEXT, { signal, deadline: Date.now() + BUDGET_MS });
}

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("PARSE_MODEL", "test-model");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("requestParse request (US-7)", () => {
  it("sends only the prompt and the delimited text, with capped tokens and no SDK retries", async () => {
    create.mockResolvedValue(validMessage);
    const signal = new AbortController().signal;

    await run(signal);

    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0];
    expect(Object.keys(body).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "output_config",
      "system",
    ]);
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(4096);
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(typeof body.system).toBe("string");
    expect(body.system.length).toBeGreaterThan(0);
    expect(body.messages).toEqual([
      { role: "user", content: `<job_posting>\n${TEXT}\n</job_posting>` },
    ]);
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBe(signal);
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(BUDGET_MS);
  });
});

describe("requestParse responses (US-7)", () => {
  it("returns the output of a valid response after one call", async () => {
    create.mockResolvedValue(validMessage);
    await expect(run()).resolves.toEqual({ ok: true, output });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("passes an isJobPosting false output through", async () => {
    const notPosting = { ...output, isJobPosting: false };
    create.mockResolvedValue(
      message("end_turn", [textBlock(JSON.stringify(notPosting))]),
    );
    await expect(run()).resolves.toEqual({ ok: true, output: notPosting });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("finds the text block after a thinking block", async () => {
    create.mockResolvedValue(
      message("end_turn", [thinkingBlock, textBlock(JSON.stringify(output))]),
    );
    await expect(run()).resolves.toEqual({ ok: true, output });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once after invalid JSON", async () => {
    create
      .mockResolvedValueOnce(invalidJsonMessage)
      .mockResolvedValueOnce(validMessage);
    await expect(run()).resolves.toEqual({ ok: true, output });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives invalid_output when the retry is invalid too, with no third call", async () => {
    create.mockResolvedValue(invalidSchemaMessage);
    await expect(run()).resolves.toEqual({
      ok: false,
      category: "invalid_output",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("logs nothing itself on the invalid_output path (the action logs the category)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockResolvedValue(invalidSchemaMessage);

    await run();

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it("retries once after a response cut off at max_tokens", async () => {
    create
      .mockResolvedValueOnce(message("max_tokens", [textBlock('{"isJob')]))
      .mockResolvedValueOnce(validMessage);
    await expect(run()).resolves.toEqual({ ok: true, output });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["refusal", "refusal"],
    ["model_context_window_exceeded", "context_window"],
  ])("gives %s → %s with no retry", async (stopReason, category) => {
    create.mockResolvedValue(message(stopReason, [textBlock("")]));
    await expect(run()).resolves.toEqual({ ok: false, category });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("requestParse API errors (US-7)", () => {
  it.each([
    [
      "BadRequestError (spend limit)",
      () => new BadRequestError(400, undefined, "bad request", headers),
      "api_bad_request",
    ],
    [
      "RateLimitError",
      () => new RateLimitError(429, undefined, "rate limited", headers),
      "api_rate_limited",
    ],
    [
      "InternalServerError",
      () => new InternalServerError(500, undefined, "server error", headers),
      "api_server",
    ],
    [
      "APIConnectionError",
      () => new APIConnectionError({ message: "connection failed" }),
      "api_connection",
    ],
  ])(
    "maps %s to its category with no retry",
    async (_name, error, category) => {
      create.mockRejectedValue(error());
      await expect(run()).resolves.toEqual({ ok: false, category });
      expect(create).toHaveBeenCalledTimes(1);
    },
  );
});

describe("requestParse budget (US-7)", () => {
  it("gives the retry only the time left of the 30 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    create
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 20_000);
        return invalidJsonMessage;
      })
      .mockResolvedValueOnce(validMessage);

    await expect(run()).resolves.toEqual({ ok: true, output });

    expect(create).toHaveBeenCalledTimes(2);
    const retryTimeout = create.mock.calls[1][1].timeout;
    expect(retryTimeout).toBeGreaterThan(0);
    expect(retryTimeout).toBeLessThanOrEqual(10_000);
  });

  it("doesn't retry when the 30 s are used up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    create.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + BUDGET_MS);
      return invalidJsonMessage;
    });

    await expect(run()).resolves.toEqual({ ok: false, category: "timeout" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["APIUserAbortError", () => new APIUserAbortError()],
    [
      "a raw AbortError while reading the body",
      () => new DOMException("aborted", "AbortError"),
    ],
  ])(
    "gives timeout when the signal aborts (%s), with no retry",
    async (_name, error) => {
      const controller = new AbortController();
      create.mockImplementation(async () => {
        controller.abort();
        throw error();
      });

      await expect(run(controller.signal)).resolves.toEqual({
        ok: false,
        category: "timeout",
      });
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it("gives timeout on APIConnectionTimeoutError, with no retry", async () => {
    create.mockRejectedValue(new APIConnectionTimeoutError());
    await expect(run()).resolves.toEqual({ ok: false, category: "timeout" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("client module (US-7)", () => {
  it("imports without ANTHROPIC_API_KEY and PARSE_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("PARSE_MODEL", undefined);
    vi.resetModules();
    await expect(import("./client")).resolves.toHaveProperty("requestParse");
  });
});
