import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/queries";

// Validates the real session on every call; proxy.ts is only an optimistic
// redirect. A missing, expired or forged session all end up on /sign-in.
export async function getCurrentUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}
