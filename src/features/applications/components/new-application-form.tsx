import { getCurrentUserId } from "@/lib/current-user";
import { ApplicationForm } from "./application-form";

// The form itself holds no user data, but the page must still validate the
// session: the proxy only checks that a cookie exists. Reads the session, so it
// must render inside <Suspense>.
export async function NewApplicationForm() {
  await getCurrentUserId();
  return <ApplicationForm />;
}

export function NewApplicationFormSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading form"
      className="flex flex-col gap-4"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}
