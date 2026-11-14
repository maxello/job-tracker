import { Suspense } from "react";
import { UserMenu } from "@/features/auth/components/user-menu";
import { Logo } from "@/features/brand/logo";

// Fixed ids are allowed only here: every route is under (main), so this layout
// renders once per document (SPEC decision log, 2026-11-14). Pages and their
// components still follow #26.
const ACCOUNT_MENU_ID = "account-menu";

// The header lives here, not in the root layout, so app/error.tsx wraps it: a
// form action's error reaches the nearest boundary above the form, and an
// error.tsx doesn't catch errors from the layout at its own level.
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex min-h-13 w-full max-w-page items-center justify-between gap-3 px-4 pt-4">
        <Logo />
        <div className="flex min-w-0 items-center gap-2">
          <Suspense>
            <UserMenu menuId={ACCOUNT_MENU_ID} />
          </Suspense>
        </div>
      </header>
      {children}
    </>
  );
}
