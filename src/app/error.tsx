"use client";

// Replaces the failed page, so it brings its own layout. Shows no error details:
// the real error is in the server logs.
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div role="alert">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t complete that. Please try again.
        </p>
      </div>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
      >
        Try again
      </button>
    </main>
  );
}
