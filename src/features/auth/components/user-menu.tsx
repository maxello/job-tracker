import Link from "next/link";
import { getSession } from "../queries";
import { SignOutButton } from "./sign-out-button";

const linkClass =
  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900";

// Reads the session, so it must render inside <Suspense>.
export async function UserMenu() {
  const session = await getSession();

  if (!session) {
    return (
      <>
        <Link href="/sign-in" className={linkClass}>
          Sign in
        </Link>
        <Link href="/sign-up" className={linkClass}>
          Sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-400">
        <span className="sr-only">Signed in as </span>
        {session.user.email}
      </p>
      <SignOutButton />
    </>
  );
}
