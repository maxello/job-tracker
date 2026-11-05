import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ApplicationDetails,
  ApplicationDetailsSkeleton,
} from "@/features/applications/components/application-details";

export const metadata: Metadata = {
  title: "Application",
};

// params and the owner check stay inside Suspense (Cache Components), so a
// missing id streams the not-found UI (soft 404, see SPEC decision log).
export default function ApplicationPage({
  params,
}: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Applications
      </Link>
      <div className="mt-2">
        <Suspense fallback={<ApplicationDetailsSkeleton />}>
          {params.then(({ id }) => (
            <ApplicationDetails id={id} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}
