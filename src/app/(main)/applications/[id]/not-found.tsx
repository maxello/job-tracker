import Link from "next/link";

// Replaces the whole page segment, so it brings its own layout.
export default function ApplicationNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Applications
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold tracking-tight">
        Application not found
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        It doesn&apos;t exist or isn&apos;t available.
      </p>
    </main>
  );
}
