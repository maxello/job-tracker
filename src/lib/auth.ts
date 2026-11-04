import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/auth/schemas";
import { db } from "@/lib/db";

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
// The cookie cache stays off (the default): a revoked session must end at once.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  session: {
    // The session is read while rendering, where cookies can't be written, so a
    // refresh would extend the row but not the cookie.
    disableSessionRefresh: true,
  },
  // Must stay last: it copies Set-Cookie headers from auth.api calls in Server
  // Actions to the Next.js response.
  plugins: [nextCookies()],
});
