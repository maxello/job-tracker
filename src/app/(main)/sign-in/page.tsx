import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      <SignInForm />
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <Link href="/sign-up" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
