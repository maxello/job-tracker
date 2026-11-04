import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

// Returns null when signed out, or when the session is expired or revoked.
// cache() shares one database read across a render pass (UserMenu and the page).
// It does nothing in Server Actions, so each action reads the session itself.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
