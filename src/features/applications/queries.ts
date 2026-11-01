import { db } from "@/lib/db";
import type { CreateApplicationInput } from "./schemas";

// Data access layer: every function takes the current user's id explicitly.

export async function createApplication(
  userId: string,
  input: CreateApplicationInput,
) {
  // A nested create runs the Application insert and the initial history
  // record in one transaction.
  return db.application.create({
    data: {
      ...input,
      userId,
      status: "WISHLIST",
      statusChanges: { create: { from: null, to: "WISHLIST" } },
    },
  });
}

// Home page list: non-archived only, newest activity first.
export async function listApplications(userId: string) {
  return db.application.findMany({
    where: { userId, archivedAt: null },
    // id breaks ties so the order is stable for equal timestamps.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      company: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });
}
