import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// Returns null when signed out, or when the session is expired or revoked.
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
