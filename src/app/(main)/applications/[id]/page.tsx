import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ApplicationDetails,
  ApplicationDetailsSkeleton,
} from "@/features/applications/components/application-details";
import { BackLink } from "@/features/applications/components/back-link";

export const metadata: Metadata = {
  title: "Application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
export default function ApplicationPage({
  params,
}: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <BackLink />
        <div className="mt-3">
          <Suspense fallback={<ApplicationDetailsSkeleton />}>
            {params.then(({ id }) => (
              <ApplicationDetails id={id} />
            ))}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
