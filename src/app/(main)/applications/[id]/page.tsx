import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ApplicationDetails,
  ApplicationDetailsSkeleton,
} from "@/features/applications/components/application-details";
import {
  BackLink,
  parseFrom,
} from "@/features/applications/components/back-link";

export const metadata: Metadata = {
  title: "Application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
// The back link reads searchParams (`from=board`, US-5), so it streams in its
// own <Suspense>; the fallback is the default link, so list visitors keep an
// instant back link (SPEC decision log, 2026-11-17).
export default function ApplicationPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <Suspense fallback={<BackLink />}>
          {searchParams.then(({ from }) => (
            <BackLink to={parseFrom(from)} />
          ))}
        </Suspense>
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
