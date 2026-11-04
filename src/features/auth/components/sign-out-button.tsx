import { signOutAction } from "../actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
      >
        Sign out
      </button>
    </form>
  );
}
