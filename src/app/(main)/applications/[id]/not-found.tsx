import { BackLink } from "@/features/applications/components/back-link";

// Replaces the whole page segment, so it brings its own layout. Its back link
// takes focus from the page's fallback back link if that had it (US-5).
export default function ApplicationNotFound() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <BackLink handoff="take" />
        <h1 className="mt-3 mb-2 page-heading">Application not found</h1>
        <p className="text-muted">
          It doesn&apos;t exist or isn&apos;t available.
        </p>
      </div>
    </main>
  );
}
