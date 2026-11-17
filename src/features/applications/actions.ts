"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { tryGetCurrentUserId } from "@/lib/current-user";
import {
  archiveApplication,
  changeApplicationStatus,
  createApplication,
  deleteApplication,
  unarchiveApplication,
  updateApplication,
  type ChangeStatusResult,
} from "./queries";
import {
  applicationIdSchema,
  changeStatusSchema,
  createApplicationSchema,
} from "./schemas";

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
const DELETE_FAILED = "Couldn't delete the application. Please try again.";
const ARCHIVE_FAILED = "Couldn't archive the application. Please try again.";
const UNARCHIVE_FAILED =
  "Couldn't unarchive the application. Please try again.";

// Read only the known fields; anything else in FormData is ignored. Raw
// submitted strings, sent back so the form keeps them after an error.
function readValues(formData: FormData) {
  const values: Partial<Record<ApplicationFieldName, string>> = {};
  for (const name of FIELD_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

export async function createApplicationAction(
  _prevState: ActionResult<never, ApplicationFieldName> | null,
  formData: FormData,
): Promise<ActionResult<never, ApplicationFieldName>> {
  const values = readValues(formData);

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

export async function updateApplicationAction(
  _prevState: ActionResult<never, ApplicationFieldName> | null,
  formData: FormData,
): Promise<ActionResult<never, ApplicationFieldName>> {
  const values = readValues(formData);

  const userId = await tryGetCurrentUserId();
  if (userId === null) {
    return { ok: false, error: { message: SAVE_FAILED }, values };
  }

  // No usable id: not found, like an id that doesn't exist.
  const id = applicationIdSchema.safeParse(formData.get("id"));
  if (!id.success) notFound();

  const result = createApplicationSchema.safeParse(values);
  if (!result.success) {
    return {
      ok: false,
      error: { fieldErrors: z.flattenError(result.error).fieldErrors },
      values,
    };
  }

  let outcome: Awaited<ReturnType<typeof updateApplication>>;
  try {
    outcome = await updateApplication(userId, id.data, result.data);
  } catch (error) {
    console.error("Failed to update application", error);
    return { ok: false, error: { message: SAVE_FAILED }, values };
  }

  // Missing or another user's application: 404, never 403.
  if (outcome === "not-found") notFound();

  // redirect alone keeps the client cache, so Back could show the old data.
  refresh();
  redirect(`/applications/${id.data}`);
}

export async function deleteApplicationAction(
  _prevState: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const userId = await tryGetCurrentUserId();
  if (userId === null) {
    return { ok: false, error: { message: DELETE_FAILED } };
  }

  const id = applicationIdSchema.safeParse(formData.get("id"));
  if (!id.success) notFound();

  let outcome: Awaited<ReturnType<typeof deleteApplication>>;
  try {
    outcome = await deleteApplication(userId, id.data);
  } catch (error) {
    console.error("Failed to delete application", error);
    return { ok: false, error: { message: DELETE_FAILED } };
  }

  // Missing or another user's application: 404, never 403.
  if (outcome === "not-found") notFound();

  // refresh clears the client cache, so Back can't show the deleted application.
  refresh();
  redirect("/");
}

// Archive and unarchive are separate actions, never a toggle: a stale tab can
// only ask for the state its button shows (SPEC.md decision log, 2026-11-12).
async function setArchived(
  formData: FormData,
  write: typeof archiveApplication | typeof unarchiveApplication,
  failed: string,
  logMessage: string,
): Promise<ActionResult<void>> {
  const userId = await tryGetCurrentUserId();
  if (userId === null) {
    return { ok: false, error: { message: failed } };
  }

  // No usable id: not found, like an id that doesn't exist.
  const id = applicationIdSchema.safeParse(formData.get("id"));
  if (!id.success) notFound();

  let outcome: Awaited<ReturnType<typeof write>>;
  try {
    outcome = await write(userId, id.data);
  } catch (error) {
    console.error(logMessage, error);
    return { ok: false, error: { message: failed } };
  }

  // Missing or another user's application: 404, never 403.
  if (outcome === "not-found") notFound();

  // The detail page is request-time data; refresh re-renders it in this
  // response. Also on a no-op, so a stale tab catches up with the database.
  refresh();
  return { ok: true, data: undefined };
}

export async function archiveApplicationAction(
  _prevState: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return setArchived(
    formData,
    archiveApplication,
    ARCHIVE_FAILED,
    "Failed to archive application",
  );
}

export async function unarchiveApplicationAction(
  _prevState: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return setArchived(
    formData,
    unarchiveApplication,
    UNARCHIVE_FAILED,
    "Failed to unarchive application",
  );
}

// A missing or foreign application, or an unusable id: the same result for
// all of them, never "forbidden".
const STATUS_NOT_FOUND = { ok: false, error: { notFound: true } } as const;

// The single entry point for status changes (detail page and board, US-5).
// It never calls notFound(): that would replace the whole board with the
// not-found UI. It returns a not-found result instead, and the detail page's
// StatusForm calls notFound() while rendering (SPEC.md decision log,
// 2026-11-17).
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
      return STATUS_NOT_FOUND;
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

  // Missing or another user's application: never 403. refresh() drops the
  // card from the board in this same response.
  if (result === "not-found") {
    refresh();
    return STATUS_NOT_FOUND;
  }

  // Detail page and board are request-time data with nothing cached to
  // revalidate; refresh re-renders them in this response. Also on a no-op, so
  // a page left stale by another tab catches up with the database.
  refresh();
  return { ok: true, data: undefined };
}
