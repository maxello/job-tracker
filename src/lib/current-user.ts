import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/queries";

// Validates the real session on every call; proxy.ts is only an optimistic
// redirect. A missing, expired or forged session all end up on /sign-in.
export async function getCurrentUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

// For Server Actions with form state: a failed session read returns null, so the
// action can answer with its generic message and the form keeps its values. A
// missing session still redirects.
export async function tryGetCurrentUserId(): Promise<string | null> {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch (error) {
    console.error("Failed to read the session", error);
    return null;
  }

  // redirect throws, so it stays outside the try/catch.
  if (!session) redirect("/sign-in");
  return session.user.id;
}
