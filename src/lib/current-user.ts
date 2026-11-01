import { db } from "@/lib/db";
import { DEMO_USER_EMAIL } from "@/lib/demo-user";

// M1 stub: every request acts as the seeded demo user. Replaced by real auth in M2.
export async function getCurrentUserId(): Promise<string> {
  const user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true },
  });
  if (!user) throw new Error("Demo user not found. Run `npx prisma db seed`.");
  return user.id;
}
