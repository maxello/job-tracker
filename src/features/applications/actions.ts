"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { tryGetCurrentUserId } from "@/lib/current-user";
import {
  changeApplicationStatus,
  createApplication,
  type ChangeStatusResult,
} from "./queries";
import { changeStatusSchema, createApplicationSchema } from "./schemas";

const FIELD_NAMES = [
  "company",
  "role",
  "url",
  "location",
  "level",
  "stack",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "notes",
] as const;

export type ApplicationFieldName = (typeof FIELD_NAMES)[number];

const SAVE_FAILED = "Couldn't save the application. Please try again.";
const STATUS_FAILED = "Couldn't update the status. Please try again.";

export async function createApplicationAction(
  _prevState: ActionResult<never, ApplicationFieldName> | null,
  formData: FormData,
): Promise<ActionResult<never, ApplicationFieldName>> {
  // Read only the known fields; anything else in FormData is ignored. Raw
  // submitted strings, sent back so the form keeps them after an error.
  const values: Partial<Record<ApplicationFieldName, string>> = {};
  for (const name of FIELD_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }

  // The owner always comes from the server, never from the submitted form.
  const userId = await tryGetCurrentUserId();
  if (userId === null) {
    return { ok: false, error: { message: SAVE_FAILED }, values };
  }

  const result = createApplicationSchema.safeParse(values);
  if (!result.success) {
    return {
      ok: false,
      error: { fieldErrors: z.flattenError(result.error).fieldErrors },
      values,
    };
  }

  try {
    await createApplication(userId, result.data);
  } catch (error) {
    console.error("Failed to create application", error);
    return { ok: false, error: { message: SAVE_FAILED }, values };
  }

  // The home list is request-time data (no "use cache"), and redirect streams
  // a fresh render of "/" in the action response, so no revalidation needed.
  // redirect throws, so it stays outside the try/catch.
  redirect("/");
}

// The single entry point for status changes (detail page now, kanban in M5).
export async function changeStatusAction(
  _prevState: ActionResult<void, "status"> | null,
  formData: FormData,
): Promise<ActionResult<void, "status">> {
  const userId = await tryGetCurrentUserId();
  if (userId === null) {
    return { ok: false, error: { message: STATUS_FAILED } };
  }

  const parsed = changeStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    // No usable id (field missing or not a string): not found, like an id that
    // doesn't exist.
    if (parsed.error.issues.some((issue) => issue.path[0] === "id")) {
      notFound();
    }
    return {
      ok: false,
      error: { fieldErrors: { status: ["Choose a valid status."] } },
    };
  }

  let result: ChangeStatusResult;
  try {
    result = await changeApplicationStatus(
      userId,
      parsed.data.id,
      parsed.data.status,
    );
  } catch (error) {
    console.error("Failed to change application status", error);
    return { ok: false, error: { message: STATUS_FAILED } };
  }

  // Missing or another user's application: 404, never 403.
  // notFound throws, so it stays outside the try/catch.
  if (result === "not-found") notFound();

  // The detail page is request-time data with nothing cached to revalidate;
  // refresh re-renders it in this response. Also on a no-op, so a page left
  // stale by another tab catches up with the database.
  refresh();
  return { ok: true, data: undefined };
}
