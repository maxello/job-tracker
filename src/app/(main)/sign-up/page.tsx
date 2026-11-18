import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "@/features/auth/components/redirect-if-signed-in";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignUpPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-8">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <h1 className="mb-6 page-heading">Sign up</h1>
      <SignUpForm />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-text underline underline-offset-2 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Sign in
        </Link>
      </p>
    </main>
  );
}
