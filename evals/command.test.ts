import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "./command";

// The real requestParse with a fake fetch: `npm test` never reaches the
// network, and the env loader is a parameter, so no env file is read.

const label = {
  isJobPosting: true,
  company: "Acme",
  role: "Engineer",
  location: null,
  level: null,
  stack: ["React"],
  salaryMin: 60000,
  salaryMax: 72000,
  salaryCurrency: "USD",
};

const negative = {
  isJobPosting: false,
  company: null,
  role: null,
  location: null,
  level: null,
  stack: [],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

const CONSOLE = ["log", "info", "debug", "warn", "error"] as const;

const fake = vi.fn<typeof fetch>();
let dir: string;
let printed: string[];
// The model's output per example name; without one, the label itself.
let outputs: Record<string, object>;
let wrapped: boolean;
let models: string[];

const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const message = (output: object) =>
  jsonResponse({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const serverError = async () => jsonResponse({ type: "error", error: {} }, 500);

function write(name: string, json: object) {
  writeFileSync(join(dir, `${name}.txt`), `Example name=${name};`);
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(json));
}

function writeSet(postings = 12, negatives = 2) {
  for (let i = 0; i < postings; i++) {
    write(`p${i}`, i === 0 ? { ...label, injection: true } : label);
  }
  for (let i = 0; i < negatives; i++) write(`n${i}`, negative);
}

const run = (loadEnv: () => void = () => {}) =>
  runCommand({ loadEnv, dataDir: dir, print: (l) => printed.push(l) });

const text = () => printed.join("\n");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eval-command-"));
  printed = [];
  outputs = {};
  wrapped = false;
  models = [];
  fake.mockReset();
  fake.mockImplementation(async (_url, init) => {
    wrapped ||= globalThis.fetch !== fake;
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    const name = /name=(\w+);/.exec(body.messages[0].content)?.[1] ?? "";
    return message(outputs[name] ?? (name.startsWith("n") ? negative : label));
  });
  vi.stubGlobal("fetch", fake);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", undefined);
  vi.stubEnv("ANTHROPIC_BASE_URL", undefined);
  vi.stubEnv("ANTHROPIC_LOG", undefined);
  vi.stubEnv("PARSE_MODEL", "claude-haiku-5-5");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runCommand env (US-7 eval)", () => {
  it("refuses an ANTHROPIC_BASE_URL set in the shell", async () => {
    writeSet();
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:3101");
    expect(await run()).toEqual({ ok: false });
    expect(text()).toContain("ANTHROPIC_BASE_URL");
    expect(fake).not.toHaveBeenCalled();
  });

  it("refuses an ANTHROPIC_BASE_URL set by the loader", async () => {
    writeSet();
    const loadEnv = () => {
      vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:3101");
    };
    expect(await run(loadEnv)).toEqual({ ok: false });
    expect(text()).toContain("ANTHROPIC_BASE_URL");
    expect(fake).not.toHaveBeenCalled();
  });

  it("doesn't refuse an empty ANTHROPIC_BASE_URL", async () => {
    writeSet();
    vi.stubEnv("ANTHROPIC_BASE_URL", "");
    expect(await run()).toEqual({ ok: true });
  });

  it.each(["ANTHROPIC_API_KEY", "PARSE_MODEL"])("needs %s", async (name) => {
    writeSet();
    vi.stubEnv(name, undefined);
    expect(await run()).toEqual({ ok: false });
    expect(text()).toContain(name);
    expect(fake).not.toHaveBeenCalled();
  });

  it("ignores a missing env file", async () => {
    writeSet();
    const loadEnv = () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    };
    expect(await run(loadEnv)).toEqual({ ok: true });
  });

  it("stops on any other loader error, with a fixed message", async () => {
    writeSet();
    const loadEnv = () => {
      throw Object.assign(new Error("SECRET-DETAIL"), { code: "EACCES" });
    };
    expect(await run(loadEnv)).toEqual({ ok: false });
    expect(text()).toContain("Couldn't load the env file");
    expect(text()).not.toContain("SECRET-DETAIL");
    expect(fake).not.toHaveBeenCalled();
  });

  it("uses the model that is set before the loader", async () => {
    writeSet();
    vi.stubEnv("PARSE_MODEL", "shell-model");
    // Like process.loadEnvFile: it doesn't replace what is already set.
    const loadEnv = () => {
      process.env.PARSE_MODEL ??= "file-model";
    };
    await run(loadEnv);
    expect(new Set(models)).toEqual(new Set(["shell-model"]));
    expect(text()).toContain("Model: shell-model");
  });

  it("uses the loader's model when none is set", async () => {
    writeSet();
    vi.stubEnv("PARSE_MODEL", undefined);
    const loadEnv = () => {
      vi.stubEnv("PARSE_MODEL", "file-model");
    };
    await run(loadEnv);
    expect(new Set(models)).toEqual(new Set(["file-model"]));
  });

  it("keeps the SDK from logging with ANTHROPIC_LOG=debug", async () => {
    writeSet();
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    const spies = CONSOLE.map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    );
    await run();
    expect(fake).toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("runCommand results (US-7 eval)", () => {
  it("prints every data error before any request", async () => {
    write("bad-one", { ...label, company: "" });
    write("bad-two", { ...label, salaryCurrency: "usd" });
    expect(await run()).toEqual({ ok: false });
    expect(text()).toContain("bad-one");
    expect(text()).toContain("bad-two");
    expect(fake).not.toHaveBeenCalled();
  });

  it("is ok when every target is met", async () => {
    writeSet();
    expect(await run()).toEqual({ ok: true });
    expect(fake).toHaveBeenCalledTimes(14 * 3);
    expect(text()).toContain("PASS");
    expect(text()).not.toContain("MISS");
  });

  it("is ok when a target is missed", async () => {
    writeSet();
    for (let i = 0; i < 12; i++) {
      outputs[`p${i}`] = { ...label, company: "Other" };
    }
    expect(await run()).toEqual({ ok: true });
    expect(text()).toContain("MISS");
  });

  it("runs a partial set, but isn't ok", async () => {
    writeSet(3, 0);
    expect(await run()).toEqual({ ok: false });
    expect(fake).toHaveBeenCalledTimes(9);
    expect(text()).toContain("run 1 (partial)");
  });

  it("runs the rest of a partial set after an API error, but isn't ok", async () => {
    writeSet(3, 0);
    fake.mockImplementationOnce(serverError);
    expect(await run()).toEqual({ ok: false });
    expect(fake).toHaveBeenCalledTimes(9);
    expect(text()).toContain("run 1 (partial, incomplete)");
  });

  it("isn't ok when an API error leaves the command incomplete", async () => {
    writeSet();
    fake.mockImplementationOnce(serverError);
    expect(await run()).toEqual({ ok: false });
    expect(fake).toHaveBeenCalledTimes(14 * 3);
    expect(text()).toContain("run 1 (incomplete)");
  });

  it.each(["a success", "an API error"])(
    "restores fetch after %s",
    async (kind) => {
      writeSet();
      if (kind === "an API error") fake.mockImplementationOnce(serverError);
      await run();
      expect(wrapped).toBe(true);
      expect(globalThis.fetch).toBe(fake);
    },
  );

  it("scores the fields after the app's validation", async () => {
    // USD without a salary: the validation empties the currency, as the user
    // would see it, and the label has none.
    const noSalary = {
      ...label,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    };
    for (let i = 0; i < 12; i++) {
      write(`p${i}`, i === 0 ? { ...noSalary, injection: true } : noSalary);
      outputs[`p${i}`] = { ...noSalary, salaryCurrency: "USD" };
    }
    write("n0", negative);
    write("n1", negative);
    expect(await run()).toEqual({ ok: true });
    expect(
      printed.find((l) => l.startsWith("salaryCurrency ")) ?? "",
    ).toContain("12/12 100.0%");
    expect(text()).not.toContain("salaryCurrency: expected");
  });
});
