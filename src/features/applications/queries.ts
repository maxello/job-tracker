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
