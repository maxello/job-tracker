import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ApplicationList,
  ApplicationListSkeleton,
} from "@/features/applications/components/application-list";
import { PageTransition } from "@/features/motion/components/page-transition";

// Its own title, like its h1 (US-2); without it the root layout's "Job
// Tracker" shows (SPEC decision log, 2026-11-20, "focus after navigation").
export const metadata: Metadata = {
  title: "Applications",
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <PageTransition untyped="crossfade">
      <main className="mx-auto w-full max-w-page px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-1">
          <h1 className="page-heading">Applications</h1>
          <Link
            href="/applications/new"
            transitionTypes={["nav-forward"]}
            className="button-ink px-4 py-2 text-sm"
          >
            New application
          </Link>
        </header>
        <Suspense fallback={<ApplicationListSkeleton />}>
          <ApplicationList searchParams={searchParams} />
        </Suspense>
      </main>
    </PageTransition>
  );
}
