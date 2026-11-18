import { BackLink } from "@/features/applications/components/back-link";

// Replaces the whole page segment, so it brings its own layout.
export default function ApplicationNotFound() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <BackLink />
        <h1 className="mt-3 mb-2 page-heading">
          Application not found
        </h1>
        <p className="text-muted">
          It doesn&apos;t exist or isn&apos;t available.
        </p>
      </div>
    </main>
  );
}
