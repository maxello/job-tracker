import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/features/applications/components/back-link";
import {
  NewApplicationForm,
  NewApplicationFormSkeleton,
} from "@/features/applications/components/new-application-form";

export const metadata: Metadata = {
  title: "New application",
};

export default function NewApplicationPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-8">
      <div className="max-w-3xl">
        <BackLink />
        <h1 className="mt-3 mb-6 font-display text-2xl font-bold tracking-tight">
          New application
        </h1>
        <Suspense fallback={<NewApplicationFormSkeleton />}>
          <NewApplicationForm />
        </Suspense>
      </div>
    </main>
  );
}
