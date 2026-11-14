import Link from "next/link";
import { getSession } from "../queries";
import { SignOutButton } from "./sign-out-button";

const linkClass = "button-quiet px-3 py-1.5 text-sm whitespace-nowrap";

// Reads the session, so it must render inside <Suspense>. Signed in, the email
// and Sign out are inline from sm; below it they move into an account menu
// built on the Popover API (no client JS). menuId comes from the (main) layout.
export async function UserMenu({ menuId }: { menuId: string }) {
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

  const { email } = session.user;

  return (
    <>
      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <p className="min-w-0 truncate font-mono text-xs text-muted">
          <span className="sr-only">Signed in as </span>
          {email}
        </p>
        <SignOutButton />
      </div>

      <button
        type="button"
        popoverTarget={menuId}
        aria-label="Account menu"
        className="button-quiet size-11 shrink-0 rounded-full font-mono text-sm sm:hidden"
      >
        <span aria-hidden="true">{email[0].toUpperCase()}</span>
      </button>

      {/* Right after the trigger, so the menu follows it in reading and tab
          order. No display utility here: it would override the UA's
          display: none and show the closed menu. inset-auto and m-0 undo the
          UA's centring (inset: 0, margin: auto) before positioning. */}
      <div
        id={menuId}
        popover="auto"
        className="inset-auto top-18 right-4 m-0 max-w-[calc(100vw-2rem)] rounded-md border border-control bg-surface p-3 text-text sm:hidden"
      >
        <div className="flex flex-col items-end gap-3">
          <p className="font-mono text-xs text-muted wrap-anywhere">
            <span className="sr-only">Signed in as </span>
            {email}
          </p>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
