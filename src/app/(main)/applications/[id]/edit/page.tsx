import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/features/applications/components/back-link";
import { EditApplicationForm } from "@/features/applications/components/edit-application-form";
import { NewApplicationFormSkeleton } from "@/features/applications/components/new-application-form";

export const metadata: Metadata = {
  title: "Edit application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
export default function EditApplicationPage({
  params,
}: PageProps<"/applications/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <BackLink />
        <h1 className="mt-3 mb-6 page-heading">
          Edit application
        </h1>
        <Suspense fallback={<NewApplicationFormSkeleton />}>
          {params.then(({ id }) => (
            <EditApplicationForm id={id} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}
