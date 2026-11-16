import { getCurrentUserId } from "@/lib/current-user";
import { createApplicationAction } from "../actions";
import { ApplicationForm } from "./application-form";

// The form itself holds no user data, but the page must still validate the
// session: the proxy only checks that a cookie exists. Reads the session, so it
// must render inside <Suspense>.
export async function NewApplicationForm() {
  await getCurrentUserId();
  return (
    <ApplicationForm
      action={createApplicationAction}
      submitLabel="Save application"
      cancelHref="/"
    />
  );
}

export function NewApplicationFormSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading form"
      // The form's card box, so its border doesn't pop in.
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-line" />
      ))}
    </div>
  );
}
