import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ApplicationDetails,
  ApplicationDetailsSkeleton,
} from "@/features/applications/components/application-details";
import { BackLink } from "@/features/applications/components/back-link";
import { parseListReturn } from "@/features/applications/list-return";
import { PageTransition } from "@/features/motion/components/page-transition";

export const metadata: Metadata = {
  title: "Application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
// The back link reads searchParams (the list's filters or `view=board`,
// US-5, US-6), so it streams in its own <Suspense>; the fallback is the
// default link, so list visitors keep an instant back link (SPEC decision
// log, 2026-11-17 and 2026-11-19); focus on the fallback moves to the real
// link (2026-11-20, "back-link focus"). The details read them too, for the
// Edit link.
export default function ApplicationPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]">) {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-page px-4 py-8">
        <div className="max-w-3xl">
          <Suspense fallback={<BackLink handoff="give" />}>
            {searchParams.then((query) => (
              <BackLink to={parseListReturn(query)} handoff="take" />
            ))}
          </Suspense>
          <div className="mt-3">
            <Suspense fallback={<ApplicationDetailsSkeleton />}>
              {Promise.all([params, searchParams]).then(([{ id }, query]) => (
                <ApplicationDetails id={id} returnTo={parseListReturn(query)} />
              ))}
            </Suspense>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
