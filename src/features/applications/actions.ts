"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import { createApplication } from "./queries";
import { createApplicationSchema } from "./schemas";

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
