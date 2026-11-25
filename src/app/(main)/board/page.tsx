import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { Board, BoardSkeleton } from "@/features/applications/components/board";
import { ViewSwitcher } from "@/features/applications/components/view-switcher";
import { PageTransition } from "@/features/motion/components/page-transition";

export const metadata: Metadata = {
  title: "Board",
};

// The board reads the session inside <Suspense>, so the header, the switcher
// and the skeleton stay in the static shell.
export default async function BoardPage() {
  await headers();
  return (
    <PageTransition untyped="crossfade">
      <main className="mx-auto w-full max-w-page px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-1">
          <h1 className="page-heading">Board</h1>
          <Link
            href="/applications/new"
            transitionTypes={["nav-forward"]}
            className="button-ink px-4 py-2 text-sm"
          >
            New application
          </Link>
        </header>
        <div className="mb-4">
          <ViewSwitcher current="board" />
        </div>
        <Suspense fallback={<BoardSkeleton />}>
          <Board />
        </Suspense>
      </main>
    </PageTransition>
  );
}
