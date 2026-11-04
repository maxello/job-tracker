import { Suspense } from "react";
import { UserMenu } from "@/features/auth/components/user-menu";

// The header lives here, not in the root layout, so app/error.tsx wraps it: a
// form action's error reaches the nearest boundary above the form, and an
// error.tsx doesn't catch errors from the layout at its own level.
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex min-h-13 w-full max-w-3xl items-center justify-end gap-2 px-4 pt-4">
        <Suspense>
          <UserMenu />
        </Suspense>
      </header>
      {children}
    </>
  );
}
