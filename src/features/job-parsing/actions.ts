"use server";

import { z } from "zod";
import { parseTimeZone } from "@/features/applications/date-filter";
import type { ActionResult } from "@/lib/action-result";
import { tryGetCurrentUserId } from "@/lib/current-user";
import { requestParse } from "./client";
import { toParsedFields } from "./parsed-fields";
import { getParseLimit, recordParseRequest } from "./rate-limit";
import { parseInputSchema, type ParsedFields } from "./schemas";

const PARSE_FAILED =
  "Couldn't parse the posting. Try again or fill in the form manually.";
const NOT_A_POSTING = "This doesn't look like a job posting.";

// One parse request has 30 s in total, including the retry (SPEC.md US-7).
const BUDGET_MS = 30_000;

type ParseState = ActionResult<ParsedFields, "text">;

// The only log line for a failed parse: our category and the text length,
// never the text, the model output or an error object (SPEC.md US-7).
function logFailure(category: string, textLength: number) {
  console.error("Job posting parse failed", { category, textLength });
}

// 24-hour HH:MM in the browser's zone, sent as `tz` (the US-6 rule: a valid
// Intl zone, otherwise UTC).
function formatResetTime(resetAt: Date, tz: FormDataEntryValue | null) {
  const timeZone = parseTimeZone(typeof tz === "string" ? tz : undefined);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(resetAt);
}

export async function parseJobPostingAction(
  _prevState: ParseState | null,
  formData: FormData,
): Promise<ParseState> {
  // Sent back on errors so the textarea keeps the text; never stored.
  const raw = formData.get("text");
  const values = typeof raw === "string" ? { text: raw } : undefined;
  const fail = (message: string): ParseState => ({
    ok: false,
    error: { message },
    values,
  });

  // A missing session redirects (outside any try/catch); a failed read is null.
  const userId = await tryGetCurrentUserId();
  if (userId === null) return fail(PARSE_FAILED);

  const input = parseInputSchema.safeParse({ text: raw });
  if (!input.success) {
    return {
      ok: false,
      error: { fieldErrors: z.flattenError(input.error).fieldErrors },
      values,
    };
  }
  const text = input.data.text;

  // Before the limit check, so a request that can't reach the API doesn't
  // count.
  if (!process.env.ANTHROPIC_API_KEY || !process.env.PARSE_MODEL) {
    logFailure("config_missing", text.length);
    return fail(PARSE_FAILED);
  }

  // The key is the session's userId. Fails closed: no API call when the
  // database can't check or record the request.
  try {
    const limit = await getParseLimit(userId, new Date());
    if (!limit.allowed) {
      return fail(
        `Daily limit reached. You can parse again after ${formatResetTime(limit.resetAt, formData.get("tz"))}.`,
      );
    }
    await recordParseRequest(userId);
  } catch {
    logFailure("rate_limit_db", text.length);
    return fail(PARSE_FAILED);
  }

  // The budget starts here, after the session and database steps.
  const result = await requestParse(text, {
    signal: AbortSignal.timeout(BUDGET_MS),
    deadline: Date.now() + BUDGET_MS,
  });
  if (!result.ok) {
    logFailure(result.category, text.length);
    return fail(PARSE_FAILED);
  }

  // Whatever fields came with it are ignored.
  if (!result.output.isJobPosting) return fail(NOT_A_POSTING);

  return { ok: true, data: toParsedFields(result.output) };
}
