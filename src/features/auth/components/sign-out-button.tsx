import { signOutAction } from "../actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="button-quiet px-3 py-1.5 text-sm whitespace-nowrap"
      >
        Sign out
      </button>
    </form>
  );
}
