import Link from "next/link";
import { Suspense } from "react";
import {
  ApplicationList,
  ApplicationListSkeleton,
} from "@/features/applications/components/application-list";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <Link
          href="/applications/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          New application
        </Link>
      </header>
      <Suspense fallback={<ApplicationListSkeleton />}>
        <ApplicationList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
