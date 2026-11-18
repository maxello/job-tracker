import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "@/features/auth/components/redirect-if-signed-in";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-8">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <h1 className="mb-6 page-heading">Sign in</h1>
      <SignInForm />
      <p className="mt-6 text-sm text-muted">
        No account yet?{" "}
        <Link href="/sign-up" className="font-medium text-text underline underline-offset-2 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Sign up
        </Link>
      </p>
    </main>
  );
}
