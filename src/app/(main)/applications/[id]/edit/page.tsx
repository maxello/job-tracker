import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Applications
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">
        Edit application
      </h1>
      <Suspense fallback={<NewApplicationFormSkeleton />}>
        {params.then(({ id }) => (
          <EditApplicationForm id={id} />
        ))}
      </Suspense>
    </main>
  );
}
