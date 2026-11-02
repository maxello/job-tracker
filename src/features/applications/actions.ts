"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
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

export type CreateApplicationState = {
  // Raw submitted strings, sent back so the form keeps them after an error.
  values: Partial<Record<ApplicationFieldName, string>>;
  fieldErrors: Partial<Record<ApplicationFieldName, string[]>>;
  // A failure that is not a validation error (e.g. the database is down).
  message?: string;
};

export async function createApplicationAction(
  _prevState: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  // The owner always comes from the server, never from the submitted form.
  const userId = await getCurrentUserId();

  // Read only the known fields; anything else in FormData is ignored.
  const values: CreateApplicationState["values"] = {};
  for (const name of FIELD_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }

  const result = createApplicationSchema.safeParse(values);
  if (!result.success) {
    return { values, fieldErrors: z.flattenError(result.error).fieldErrors };
  }

  try {
    await createApplication(userId, result.data);
  } catch (error) {
    console.error("Failed to create application", error);
    return {
      values,
      fieldErrors: {},
      message: "Couldn't save the application. Please try again.",
    };
  }

  // The home list is request-time data (no "use cache"), and redirect streams
  // a fresh render of "/" in the action response, so no revalidation needed.
  // redirect throws, so it stays outside the try/catch.
  redirect("/");
}

export type ChangeStatusState = { error?: string };

// The single entry point for status changes (detail page now, kanban in M5).
export async function changeStatusAction(
  _prevState: ChangeStatusState,
  formData: FormData,
): Promise<ChangeStatusState> {
  const userId = await getCurrentUserId();

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
    return { error: "Choose a valid status." };
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
    return { error: "Couldn't update the status. Please try again." };
  }

  // Missing or another user's application: 404, never 403.
  // notFound throws, so it stays outside the try/catch.
  if (result === "not-found") notFound();

  // The detail page is request-time data with nothing cached to revalidate;
  // refresh re-renders it in this response. Also on a no-op, so a page left
  // stale by another tab catches up with the database.
  refresh();
  return {};
}
