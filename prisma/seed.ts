// Run with `npx prisma db seed` (Node strips the types natively; no @/ alias here).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { DEMO_USER_EMAIL } from "../src/lib/demo-user.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const user = await db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL },
  });
  console.log(`Demo user ready: ${user.email} (${user.id})`);
} finally {
  await db.$disconnect();
}
