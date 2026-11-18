"use client";

// Replaces the failed page, so it brings its own layout. Shows no error details:
// the real error is in the server logs.
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div role="alert">
        <h1 className="mb-2 page-heading">
          Something went wrong
        </h1>
        <p className="mb-6 text-muted">
          We couldn&apos;t complete that. Please try again.
        </p>
      </div>
      <button
        type="button"
        onClick={() => retry()}
        className="button-ink px-4 py-2 text-sm"
      >
        Try again
      </button>
    </main>
  );
}
