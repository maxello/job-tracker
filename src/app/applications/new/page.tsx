import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationForm } from "@/features/applications/components/application-form";

export const metadata: Metadata = {
  title: "New application",
};

export default function NewApplicationPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Applications
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">
        New application
      </h1>
      <ApplicationForm />
    </main>
  );
}
