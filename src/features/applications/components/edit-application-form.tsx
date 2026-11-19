import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { updateApplicationAction } from "../actions";
import { toFormValues } from "../form-values";
import { listReturnQuery, type ListReturn } from "../list-return";
import { getApplication } from "../queries";
import { applicationIdSchema } from "../schemas";
import { ApplicationForm } from "./application-form";

// Reads the session, so it must render inside <Suspense>.
// `returnTo`: the list's filters or the board (US-5, US-6). Cancel keeps it,
// and the hidden `return` input sends it to the action for the redirect.
export async function EditApplicationForm({
  id,
  returnTo,
}: {
  id: string;
  returnTo?: ListReturn;
}) {
  const userId = await getCurrentUserId();
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const application = await getApplication(userId, parsedId.data);
  // Missing or another user's application: 404, never 403.
  if (!application) notFound();

  const query = returnTo ? listReturnQuery(returnTo) : "";

  return (
    <ApplicationForm
      action={updateApplicationAction}
      id={application.id}
      initialValues={toFormValues(application)}
      submitLabel="Save changes"
      cancelHref={`/applications/${application.id}${query}`}
      returnQuery={query}
    />
  );
}
