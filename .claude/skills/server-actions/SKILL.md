---
name: server-actions
description: "Conventions for Server Actions in this project (ActionResult, Zod validation, user id and ownership, error handling, refreshing data). Use when planning, writing or changing a Server Action, a form that submits to one with useActionState (including adding or removing a form field), a mutation, or the Zod schema an action validates with. Not for styling, read-only pages or queries, or tests unrelated to actions."
user-invocable: false
---

# Server Actions

Reference example: `updateApplicationAction` in `src/features/applications/actions.ts` (every step below). For library errors and keeping the password out of `values`: `signUpAction` in `src/features/auth/actions.ts`.

## Shape

- Actions live in `src/features/<feature>/actions.ts` (`"use server"`).
- Signature: `(_prevState: ActionResult<…> | null, formData: FormData) => Promise<ActionResult<…>>`.
- The form calls `useActionState(action, null)`: `null` means nothing submitted yet.

## `ActionResult` (`src/lib/action-result.ts`)

- `ActionResult<T, F, V>`: `T` success data, `F` fields that can carry errors, `V` fields sent back in `values`.
- Actions that end in `redirect()` use `T = never`: they only return failures.
- Read only known fields from FormData, with a local helper in each `actions.ts` (`readValues` in applications, `readString` in auth; not shared imports). Send the raw submitted strings back in `values` so the form keeps them after an error.
- Never send a password back: leave it out of `V` (see `SignUpResult`, `SignInResult`).

## User id and ownership

- Actions that act on the user's data start with `tryGetCurrentUserId()` (`src/lib/current-user.ts`). `null` (session read failed) → return the generic message with `values`. No session → it redirects to `/sign-in`.
- Sign-up and sign-in run without a session by design: they don't call it.
- `getCurrentUserId()` is what pages use; no action calls it.
- Pass `userId` to the DAL functions in the feature's `queries.ts`. They filter by `{ id, userId }` and return `"not-found"` for a missing row or another user's row; the action then calls `notFound()` (404, never 403).
- An id that fails `applicationIdSchema` also → `notFound()`, like an unknown id.

## Validation

- Validate input with Zod on the server, using schemas from the feature's `schemas.ts` and `safeParse`.
- Field errors: `z.flattenError(result.error).fieldErrors`.
- Text stored in Postgres gets `.refine(hasNoNul, NUL_MESSAGE)` from `src/lib/validation.ts` (Postgres text can't hold a NUL byte).

## Errors

- Expected failures are returned: validation errors, and known library errors mapped to a field or message (Better Auth: `isAPIError(error)` + `error.body?.code`, not the HTTP status).
- `try/catch` wraps only the DAL or `auth.api` call. Unexpected errors: `console.error("Failed to …", error)`, then return a generic message constant (`SAVE_FAILED`, …). Users never see the real error.
- Actions without form state (`signOutAction`) log and rethrow to `error.tsx`.

## Refreshing data

- Data is request-time: no `"use cache"`, no `revalidatePath`.
- When the client cache could show stale data (update, delete, status change): `refresh()` from `next/cache`, then `redirect()` or `return { ok: true, data: … }`.
- Create: `redirect("/")` alone streams a fresh render of `/`.
- `refresh()` and `redirect()` go after the try/catch.
