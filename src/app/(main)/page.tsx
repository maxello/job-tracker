import Link from "next/link";
import { Suspense } from "react";
import {
  ApplicationList,
  ApplicationListSkeleton,
} from "@/features/applications/components/application-list";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-1">
        <h1 className="page-heading">
          Applications
        </h1>
        <Link href="/applications/new" className="button-ink px-4 py-2 text-sm">
          New application
        </Link>
      </header>
      <Suspense fallback={<ApplicationListSkeleton />}>
        <ApplicationList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
