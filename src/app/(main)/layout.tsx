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
  // The min-height includes pt-4 and fits UserMenu's tallest content, so the
  // header doesn't grow when it streams in: the 44px account-menu trigger
  // below sm (16 + 44 = min-h-15), 34px controls from sm (min-h-13).
  return (
    <>
      <header className="mx-auto flex min-h-15 w-full max-w-page items-center justify-between gap-3 px-4 pt-4 sm:min-h-13">
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
