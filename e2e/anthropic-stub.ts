import { createServer } from "node:http";

// A local stand-in for the Claude Messages API, so e2e never calls the real
// API (SPEC.md decision log, "parse UI details"). playwright.config.ts starts
// it and points the app at it with ANTHROPIC_BASE_URL. It runs as its own
// process, so a test picks the reply with a marker in the posting text.
// GET /requests returns how many /v1/messages calls it has received.

// The same port as STUB_URL in playwright.config.ts and the parse spec.
const STUB_PORT = 3101;

const FIRST = {
  isJobPosting: true,
  company: "Stubbed Co",
  role: "Frontend Engineer",
  location: "Remote",
  // null: the form must get "" for it.
  level: null,
  stack: ["React", "TypeScript"],
  salaryMin: 100000,
  salaryMax: 120000,
  salaryCurrency: "USD",
};

const SECOND = {
  isJobPosting: true,
  company: "Second Co",
  role: "Backend Engineer",
  location: "Kyiv",
  level: "Senior",
  stack: ["Go"],
  salaryMin: 90000,
  salaryMax: 95000,
  salaryCurrency: "EUR",
};

const NOT_A_POSTING = {
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

let requests = 0;

function message(output: object) {
  return {
    id: "msg_e2e_stub",
    type: "message",
    role: "assistant",
    model: "e2e-stub-model",
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function postingText(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      messages?: { content?: unknown }[];
    };
    const content = parsed.messages?.[0]?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/requests") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ requests }));
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404).end();
    return;
  }

  requests += 1;
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8");
  });
  req.on("end", () => {
    const text = postingText(body);
    const send = (status: number, payload: object) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (text.includes("E2E-API-ERROR")) {
      send(500, {
        type: "error",
        error: { type: "api_error", message: "stub" },
      });
    } else if (text.includes("E2E-NOT-A-POSTING")) {
      send(200, message(NOT_A_POSTING));
    } else if (text.includes("E2E-SECOND")) {
      send(200, message(SECOND));
    } else if (text.includes("E2E-SLOW")) {
      setTimeout(() => send(200, message(FIRST)), 1500);
    } else {
      send(200, message(FIRST));
    }
  });
});

server.listen(STUB_PORT, "127.0.0.1");
