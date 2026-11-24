import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/features/applications/components/back-link";
import {
  NewApplicationForm,
  NewApplicationFormSkeleton,
} from "@/features/applications/components/new-application-form";
import { JobPostingParser } from "@/features/job-parsing/components/job-posting-parser";
import { PageTransition } from "@/features/motion/components/page-transition";

export const metadata: Metadata = {
  title: "New application",
};

export default function NewApplicationPage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-page px-4 py-8">
        <div className="max-w-3xl">
          <BackLink />
          <h1 className="mt-3 mb-6 page-heading">New application</h1>
          <JobPostingParser>
            <Suspense fallback={<NewApplicationFormSkeleton mode="new" />}>
              <NewApplicationForm />
            </Suspense>
          </JobPostingParser>
        </div>
      </main>
    </PageTransition>
  );
}
