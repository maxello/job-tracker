import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/features/applications/components/back-link";
import { EditApplicationForm } from "@/features/applications/components/edit-application-form";
import { NewApplicationFormSkeleton } from "@/features/applications/components/new-application-form";
import { parseListReturn } from "@/features/applications/list-return";
import { PageTransition } from "@/features/motion/components/page-transition";

export const metadata: Metadata = {
  title: "Edit application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
// The back link, Cancel and Save keep the list's filters or `view=board`
// (US-5, US-6), so they read searchParams; the back link streams in its own
// <Suspense> with the default link as fallback, like the detail page's (SPEC
// decision log, 2026-11-19), and hands focus over the same way (2026-11-20,
// "back-link focus").
export default function EditApplicationPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]/edit">) {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-page px-4 py-8">
        <div className="max-w-3xl">
          <Suspense fallback={<BackLink handoff="give" />}>
            {searchParams.then((query) => (
              <BackLink to={parseListReturn(query)} handoff="take" />
            ))}
          </Suspense>
          <h1 className="mt-3 mb-6 page-heading">Edit application</h1>
          <Suspense fallback={<NewApplicationFormSkeleton mode="edit" />}>
            {Promise.all([params, searchParams]).then(([{ id }, query]) => (
              <EditApplicationForm id={id} returnTo={parseListReturn(query)} />
            ))}
          </Suspense>
        </div>
      </main>
    </PageTransition>
  );
}
