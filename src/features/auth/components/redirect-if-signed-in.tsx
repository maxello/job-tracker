import { redirect, unstable_rethrow } from "next/navigation";
import { getSession } from "../queries";

// Reads the session, so it must render inside <Suspense>. Renders nothing, so
// the sign-in and sign-up forms stay in the static shell. Not in proxy.ts: the
// proxy only sees that a cookie exists, and a stale one would cause a loop.
export async function RedirectIfSignedIn() {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch (error) {
    // During the build prerender, headers() rejects once the static shell is
    // done; that is Next's signal, not a failed read, so it must not be caught.
    unstable_rethrow(error);
    // A failed read keeps the form usable; the error goes to server logs only.
    console.error("Failed to read the session", error);
    return null;
  }

  // redirect throws, so it stays outside the try/catch.
  if (session) redirect("/");
  return null;
}
