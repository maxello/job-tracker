# Job Tracker — Product Spec

## 1. Problem

I track job applications in spreadsheets and notes. Statuses get lost, I can't
see at a glance which stage each application is at, and there is no history of
when things changed. Copying details from a job posting by hand is tedious.

## 2. Goals / Non-goals

Goals:

- One place to see all my applications and their current stage
- A full, timestamped history of status changes per application
- Fast entry: a short form, or paste a job posting and let AI fill in the fields
- Private data: each user sees only their own applications

Non-goals (MVP):

- Email parsing
- Browser extension
- Team / shared features
- Mobile app (the web app is responsive instead)
- Scraping job postings from a URL
- Reminders about the next step (a known pain point, deliberately out of scope
  for the MVP)
- Importing existing spreadsheets or backdating dates and history entries;
  all timestamps are set by the server at the moment of the action
- Account deletion
- Pagination (assumption: one user has fewer than ~500 applications)

## 3. Users

One type: a job seeker with an account. Data is private per user: another
account can never read or modify my applications.

## 4. User stories + acceptance criteria

### Conventions used by all stories

- "Last updated" means `Application.updatedAt`: it changes on any edit, status
  change, archive or unarchive. The list shows it, sorts by it, and the date
  filter uses it
- Timestamps are stored in UTC and displayed in the browser's local timezone as
  an absolute date (and time on the detail page)
- Concurrent edits (e.g. two tabs): last write wins
- An id that does not exist or belongs to another user gets the not-found
  response (never a "forbidden" one), and the response is identical in both
  cases, so the existence of other users' records is not revealed. Pages that
  stream (Cache Components) show the not-found UI with HTTP status 200 and
  `noindex`; responses sent before streaming use HTTP 404

### US-0 Sign up / sign in (M2)

As a job seeker, I want to sign up and sign in, so that my applications are private and available only to me.

- A user can register with name, email and password, and sign in; signing out
  ends the session (Better Auth with database sessions, see the decision log)
- Registration fields:
  - name (required, up to 100 chars, trimmed)
  - email (required, up to 254 chars, valid format, trimmed and lowercased)
  - password (required, 8–128 chars, not trimmed)
- Unauthenticated users are redirected to the sign-in page
- After sign-in, every page and action shows only the current user's data
- Every action on another user's application that exists at the current
  milestone (via UI or by swapping the id in a request) gets the not-found
  response and changes nothing: open and change status from M2, edit and
  delete from M3, archive and unarchive from M4
- Data created under the M1 demo-user stub is wiped when M2 ships (it is dev
  data only; no migration)

### US-1 Add application (M1)

As a job seeker, I want to quickly add an application I've sent, so that I have all my applications in one place.

- Fields:
  - company (required, 1–200 chars)
  - role (required, 1–200 chars)
  - job URL (optional, max 2048 chars, must be an absolute `http` or `https`
    URL; other schemes such as `javascript:` are rejected)
  - notes (optional, max 5000 chars)
  - location (optional, max 200 chars)
  - level (optional, free text, max 100 chars, e.g. "Junior", "Senior")
  - stack (optional, list of up to 30 tags, each max 50 chars)
  - salary min / salary max (optional, non-negative integers up to 2147483647,
    annual gross only; if both are set, min ≤ max)
  - salary currency (required if any salary value is set, three letters in the
    ISO 4217 format, e.g. "USD", "EUR", "UAH"; only the format is checked, not
    the list of assigned codes)
- Text inputs are trimmed; a whitespace-only value counts as empty
- Validation runs on the server; field errors are shown next to the fields
- A new application gets status Wishlist, and a history record
  (from: none, to: Wishlist) is written in the same transaction
- After saving, it appears in the list without a full page reload

### US-2 View list (M1)

As a job seeker, I want to see all my applications in one list, so that I know at a glance where each one stands.

- The list is the home page
- Each row shows company, role, status and last updated date
- Sorted by last updated, newest first
- Archived applications are hidden by default (see US-8)
- Empty state with a call to action: "Add your first application"
- Each row links to the application detail page

### US-3 Change status (M1)

As a job seeker, I want to change an application's status and see its history, so that I know which stage it is at and when it changed.
Statuses: Wishlist, Applied, Interview, Offer, Rejected

- In M1 the status is changed on a minimal detail page: read-only fields, a
  status select and the status history in chronological order (oldest first).
  US-4 (M3) adds deleting to this page and editing on `/applications/[id]/edit`,
  linked from it
- Any transition between two different statuses is allowed, in any direction
- Setting the current status again (e.g. Applied → Applied) is a no-op: no
  history record is written and `updatedAt` does not change
- Each change is recorded in history with a timestamp (from, to, changedAt)
- The status update and the history record are written in one transaction
- All status changes (detail page, kanban) go through one server action
  and one data access layer function, so these rules cannot diverge

### US-4 Edit and delete on the detail page (M3)

As a job seeker, I want to edit or delete an application, so that my data stays accurate and free of mistakes.

- Extends the M1 detail page (US-3), which already shows all fields and the
  status history including the initial Wishlist record
- All fields can be edited on `/applications/[id]/edit`, linked from the detail
  page, with the same validation as US-1; editing fields does not write status
  history
- Delete asks for confirmation in a native `<dialog>`; after deletion the user
  returns to the list
  and the application no longer appears anywhere in the UI
- Delete is a hard delete: the application and its status history are removed
  permanently

### US-5 Kanban board (M5)

As a job seeker, I want to see my applications on a board by status and move them between columns, so that I can track and update my pipeline visually.

- One column per status; archived applications are not shown
- Cards within a column are ordered by last updated, newest first (no manual
  ordering)
- Cards can be moved between columns with drag-and-drop
- Keyboard and screen-reader alternative: each card has a status select (or the
  DnD library's keyboard mode) that performs the same move
- Dropping a card into its own column is a no-op (same rule as US-3)
- Each move changes the status and writes a history record (same rules as US-3)
- The move is shown optimistically; if the server action fails, the card returns
  to its previous column and an error message is shown
- Below 768px the board scrolls horizontally with one column per screen width
  (scroll snap); the page itself does not scroll horizontally

### US-6 Search and filters (M5)

As a job seeker, I want to search and filter my applications, so that I can quickly find the ones I need.

The status filter (multiple selection, URL state, the empty-result message) is
pulled forward into M3; search and the date range stay in M5 (see the decision
log, 2026-11-11).

- Search by company and role: case-insensitive, substring match
- Filter by status (multiple selection) and by last updated date range
  (from / to, both optional, inclusive, in the user's local timezone)
- Search and filters can be combined (AND)
- Archived applications are excluded from search results unless "Show
  archived" is on (US-8)
- Search and filter state is stored in the URL query string, so it survives a
  reload and can be bookmarked
- An empty result shows "No applications match your filters" with a way to
  clear them

### US-7 AI job posting parsing (M6)

As a job seeker, I want to paste a job posting and have the form filled in for me, so that I don't have to copy the details by hand.

- The user pastes the text of a job posting (max 20,000 characters; longer input
  is rejected with a message before any API call)
- The app calls the Claude API from the server only (the API key is never sent
  to the browser) and returns structured fields: company, role, stack, location,
  level, salary min / max / currency
- The model output is validated with the same Zod schema as US-1; fields the
  model could not find or that fail validation are left empty
- The parsed fields pre-fill the US-1 form; the user reviews and edits them and
  saves through the normal US-1 flow. Nothing is saved automatically
- The pasted text is treated as data, not instructions (it is passed in a
  delimited block, and only the structured output is used)
- If the text does not look like a job posting, or the API call fails or times
  out (30 s), the user sees an error message and can fill in the form manually
- Rate limit: 20 parse requests per user per day
- The UI tells the user that the pasted text is sent to a third-party AI
  provider
- Parsing quality is measured by a separate eval script on 12–15 real postings
  with hand-labelled expected fields. Metric: per-field accuracy (normalized
  exact match for company, role, location, level, salary; set overlap for
  stack). Target: ≥ 90% for company and role, ≥ 70% for the other fields

### US-8 Archive application (M4)

As a job seeker, I want to archive applications that are no longer relevant, so that my list and board stay focused without losing their history.

- An application can be archived from the detail page and unarchived from it,
  with plain "Archive" and "Unarchive" buttons and no confirmation (it is
  reversible). Afterwards the user stays on the detail page, which refreshes
  (like a status change)
- Archive and unarchive are separate intents, never a toggle. Archiving an
  archived application, or unarchiving an active one (e.g. from a stale tab),
  is a no-op: `archivedAt` and `updatedAt` don't change
- Archiving does not change the status and does not write status history
- An archived application's detail page shows an "Archived" badge (no date)
  and stays accessible and editable: the edit form, status changes (history as
  usual; a status change does not unarchive) and delete all work
- Archived applications are hidden from the list, kanban board and search
  results by default. In M4 this covers the list; the board and search exclude
  them from M5 (US-5, US-6)
- "Show archived" is a checkbox in the list's filter form, stored in the URL
  (`?archived=1`) and applied with Apply, like the status filter, and combined
  with it. It shows active and archived applications together, in the US-2
  order (last updated, newest first). Archived rows get an "Archived" badge
  next to the status badge, with no date
- Empty states: a user with no applications sees "No applications yet" (US-2);
  a user whose applications are all archived sees "All your applications are
  archived" with a link that turns on "Show archived"; filters that match
  nothing show "No applications match your filters"
- Archive and unarchive follow the same ownership rules as US-0

## 5. Data model (draft)

```text
User(id, name, email, emailVerified, image?, createdAt, updatedAt)
Session(id, userId, token, expiresAt, ipAddress?, userAgent?, createdAt,
  updatedAt)
Account(id, userId, accountId, providerId, password?, accessToken?,
  refreshToken?, idToken?, accessTokenExpiresAt?, refreshTokenExpiresAt?,
  scope?, createdAt, updatedAt)
  - the password hash lives here, with `providerId` "credential"
Verification(id, identifier, value, expiresAt, createdAt, updatedAt)
  - required by Better Auth; unused until email verification or password reset
Application(id, userId, company, role, url?, notes?, location?, level?,
  stack String[], salaryMin Int?, salaryMax Int?, salaryCurrency?, status,
  archivedAt?, createdAt, updatedAt)
StatusChange(id, applicationId, from Status?, to Status, changedAt)
  - `from` is null only for the initial record written on creation
Status: Prisma enum (WISHLIST, APPLIED, INTERVIEW, OFFER, REJECTED)
```

`StatusChange` has no `userId`: it is always read and written through an
Application that has already been checked for ownership.

## 6. Architecture

| Layer   | What                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| UI      | Next.js (App Router), Server Components by default, Tailwind, responsive down to 360px, accessible forms                |
| Logic   | Server Actions with Zod validation on the server                                                                        |
| Data    | Postgres on Neon via Prisma: User, Session, Account, Verification, Application, StatusChange                            |
| Access  | Better Auth (email + password, database sessions) + owner check on every request through a data access layer            |
| AI      | Claude API, called from server code only (M6)                                                                           |
| Quality | Vitest (unit), Playwright (e2e); from M7: CI and error monitoring                                                       |
| Deploy  | From M7: Vercel, preview deployment for every PR, each preview uses its own Neon branch (never the production database) |

Code layout: `src/features/applications/` and `src/features/auth/`, each with
`components/`, `actions.ts`, `schemas.ts`, `queries.ts`. The Better Auth instance
lives in `src/lib/auth.ts`.

## 7. Non-functional

- Server-side validation for every mutation
- Every DB query is scoped to the current user via the data access layer:
  Application queries filter by `userId`; StatusChange queries go through an
  owned Application
- Accessible forms (labels, error messages, keyboard navigation); every
  drag-and-drop action has a keyboard alternative
- Responsive down to 360px, no horizontal page scroll
- Job URLs are rendered as links only after server-side `http`/`https`
  validation
- TypeScript strict; lint and typecheck pass before every commit (checked
  manually in M1–M2, enforced by hooks from M3 and by CI on every PR from M7)

## 8. Milestones

- M1 (week 1): list + create + minimal detail page with status change and
  history, demo-user auth stub
- M2 (week 2): real auth + data isolation per user (verified manually with two
  accounts); demo data wiped
- M3 (week 3): edit + delete; Vitest and Playwright set up; unit test for the
  status-change transaction, e2e test for cross-user isolation, unit and e2e
  tests for M1–M3 stories; hooks enforce lint and typecheck; signed-in users are
  redirected away from `/sign-in` and `/sign-up`, covered by an e2e test; the
  status filter from US-6, pulled forward from M5 (see the decision log)
- M4 (week 4): archive application (US-8)
- M5 (week 5): kanban board + search and filters
- M6 (week 6): AI job posting parsing + eval script
- M7–M8 (weeks 7–8): deploy, preview deployments, CI, monitoring, portfolio prep
  - Required before the public deploy (M7): rate limiting for sign-in and sign-up,
    the sign-out behavior when the database fails, security headers (see Open
    questions)
  - Required by the end of M8: open tabs react when the account changes (see Open
    questions)

## 9. Open questions

- Should the create form allow choosing an initial status other than Wishlist?
- How are sign-in and sign-up rate limited before the public deploy (M7)? Better
  Auth's limiter does not apply to `auth.api` calls from Server Actions, so
  attempts are currently unlimited. Deferred on purpose: design one table for
  these limits and the M6 parse limit (20 per user per day), in M6 or at the
  start of M7, and ship it before the deploy
- How should sign-out end the session when the database fails? `auth.api.signOut`
  clears the cookie and reports success, but the session row stays valid until it
  expires (at most 7 days), so a copied cookie keeps working. Decide before the
  public deploy (M7)
- Which security headers ship with the public deploy (M7)? HSTS and a CSP with
  only `frame-ancestors` are expected; neither affects rendering. A `script-src`
  policy needs a separate decision: nonces require dynamic rendering and are
  incompatible with Partial Prerendering, which the app uses. The alternative,
  `'unsafe-inline'`, allows the inline scripts from Next.js and `LocalDate` but
  adds little XSS protection
- How should other open tabs react when the account changes? The session cookie
  is shared, but `UserMenu` sits in a layout that doesn't re-render on
  navigation: a stale tab keeps the old email and the old list, while new actions
  run as the new user. Proposed: a small client component posts the session's
  `userId` through `BroadcastChannel`, and tabs with a different id call
  `router.refresh()`. Deferred to M8: the case is rare and data isolation still
  holds

## 10. Decision log

- 2026-10-30: application status is a Prisma enum, not a separate table. The
  statuses are a fixed list that users cannot change, and the enum gives
  database-enforced values and generated TypeScript types without a join. The
  rejected alternative was a `Status` table, which only pays off if statuses are
  editable, and no user story needs that. The cost: adding a status needs a
  migration
- 2026-10-30: all mutations are Server Actions with Zod validation on the server
- 2026-10-30: feature code lives in `src/features/applications/`
- 2026-10-30: Server Components by default; `"use client"` only when needed
- 2026-10-30: Tailwind only, no UI component libraries (a headless
  drag-and-drop library such as dnd-kit is allowed for US-5)
- 2026-10-30: commits follow Conventional Commits
- 2026-10-30: no auth in week 1, demo-user stub until M2; demo data is wiped at M2
- 2026-10-30: any status transition is allowed (real life is messy); setting the
  same status is a no-op
- 2026-10-30: parsed AI fields (stack, location, level, salary) are stored as
  optional Application columns
- 2026-10-30: salary is stored as annual gross only
- 2026-10-30: date filter uses last updated (`updatedAt`)
- 2026-10-30: reminders stay out of scope for the MVP
- 2026-10-30: deploy, CI and previews stay in M7; hooks enforce lint and
  typecheck from M3 (week 3), tests start in M3
- 2026-10-30: status change in M1 lives on a minimal detail page; US-4 adds
  edit and delete to it in M3
- 2026-10-30: other users' records return 404, not 403
- 2026-11-01: Prisma 7.10.1 (pinned stable) with `@prisma/adapter-pg`; the
  generated client lives in `src/generated/prisma` (gitignored, created by
  `postinstall`)
- 2026-11-01: env is loaded with Node's `process.loadEnvFile()` and the seed
  runs on native Node type stripping (no dotenv, no tsx)
- 2026-11-01: the M1 demo-user stub finds the seeded user by email
  (`demo@example.com`)
- 2026-11-02: the create form disables native browser validation (`noValidate`);
  the server-side Zod schema is the only source of field errors
- 2026-11-02: salary currency is a text input with `<datalist>` suggestions
  (any ISO 4217 code is accepted), not a `<select>`
- 2026-11-02: creating an application needs no revalidation while the home list
  is request-time data (no `"use cache"`); `redirect("/")` from the Server
  Action streams a fresh render. Once the list is cached, the action calls
  `updateTag` before redirecting
- 2026-11-02: the status is changed with a `<select>` and an explicit "Update
  status" button, not auto-submit on change (arrow keys would submit on every
  step)
- 2026-11-02: the status action calls `refresh()` (also on a no-op): the detail
  page is request-time data with nothing cached to revalidate. Once it is
  cached, the action calls `updateTag` instead
- 2026-11-02: `changeApplicationStatus` reads the current status with
  `SELECT … FOR UPDATE` inside an interactive transaction, so `from` is always
  the status in the database and concurrent changes are serialized (last write
  wins, history has no gaps)
- 2026-11-02: the detail page checks ownership inside `<Suspense>` (Cache
  Components), so a missing or foreign id streams the 404 UI with HTTP status
  200 and `noindex` (soft 404)
- 2026-11-02: the soft 404 is accepted, and the 404 convention is reworded to
  mean "the not-found response, identical for missing and foreign ids" rather
  than the HTTP status. Non-disclosure is the goal, and it holds. The rejected
  alternative was a real 404: check ownership before any `<Suspense>` and set
  `export const instant = false` on the page. That costs the static shell,
  instant navigation and partial prefetching for little gain in a private app.
  E2E tests check the not-found UI, not the status code
- 2026-11-02: empty optional fields on the detail page are shown as "—"
- 2026-11-04: status history is a separate `StatusChange` table, not a JSON
  column on Application: the database enforces its types and foreign key, and
  it stays queryable across applications
- 2026-11-04: delete is a hard delete; the existing `onDelete: Cascade` removes
  the status history. Soft delete was rejected: every query would need a
  `deletedAt` filter, there is no restore UI, and the user's data would stay
  stored after "delete". US-8 archive already covers hiding an application
  while keeping its history. An accidental delete cannot be undone, so the
  US-4 confirmation is the only safeguard
- 2026-11-04: auth is Better Auth (1.7.16 or newer) with email + password.
  Auth.js was the rejected alternative: Better Auth has built-in email + password
  and a Prisma adapter, so the app needs no hand-written credentials code. OAuth
  was rejected because email + password needs no third-party app setup. Password
  reset and email verification are out of scope
- 2026-11-04: sessions are stored in the database and the cookie cache stays off.
  With the cookie cache, a revoked session could stay active until the cached
  cookie expires. The cost is one session query per request
- 2026-11-04: `/api/auth/[...all]` is not mounted, unlike the Better Auth Next.js
  guide. Forms use Server Actions that call `auth.api`. Mounting it would expose
  REST endpoints such as `/update-user` and `/change-password` that bypass the
  Zod schemas. Mount it only if OAuth or the client SDK is ever needed
- 2026-11-04: session refresh is off (`disableSessionRefresh`), so a session ends
  7 days after sign-in, even for an active user. The session is read during
  render, where cookies can't be written: a refresh would extend the row but not
  the cookie, and could throw during render. The rejected alternative was the
  default sliding session
- 2026-11-04: the demo user is kept until the day 3 wipe. The Better Auth
  migration adds `User.name` and `User.updatedAt` as nullable, backfills the row
  and then sets NOT NULL. Rejected: a permanent `@default("")` on `name`, which
  would hide a missing name, and a nullable `name`, which Better Auth requires
- 2026-11-04: Prisma models for Better Auth are written by hand from its core
  schema rather than with `npx auth@latest generate`, so the existing `User` model
  and table name stay as they are
- 2026-11-04: auth errors are matched on `error.body.code`, not the status:
  Better Auth also uses 422 for a failed user insert and 401 for a failed session
  insert, which are not "email taken" or "wrong password"
- 2026-11-04: sign-up shows a field error for a taken email, which reveals that
  the email is registered. Sign-in does not: an unknown email and a wrong
  password show the same message
- 2026-11-04: `src/proxy.ts` is only an optimistic redirect: it checks that the
  session cookie exists (`getSessionCookie`) and never reads the database. Every
  page and Server Action validates the session through `getCurrentUserId()`,
  which redirects to `/sign-in` for a missing, expired or forged session. It
  never redirects away from `/sign-in` or `/sign-up`, because a stale cookie
  would cause a loop
- 2026-11-04: the proxy protects every path by default; only `/sign-in`,
  `/sign-up` and static files are public, so an unknown URL also goes to
  `/sign-in` for a visitor with no cookie
- 2026-11-04: the proxy redirects GET and HEAD only. Server Actions are POSTs: a
  307 would replay them against `/sign-in` and the client would show an error
  page. They pass through and redirect from `getCurrentUserId()`
- 2026-11-04: there is no return-to parameter; sign-in always goes to `/`.
  Sign-out redirects straight to `/sign-in`: a redirect to `/` would hit the
  proxy with an empty cookie on the action's internal fetch
- 2026-11-04: a stale cookie passes the proxy, so the redirect comes from inside
  `<Suspense>`: HTTP status 200 and a short skeleton before `/sign-in`, the same
  Cache Components trade-off as the soft 404. Only a visitor with no cookie gets
  a real 307
- 2026-11-04: `/applications/new` validates the session inside `<Suspense>`, so
  the form is no longer in the static shell. The proxy alone would show it to a
  garbage cookie
- 2026-11-04: `await connection()` is removed from the list: `getCurrentUserId()`
  now reads `headers()`, and the docs say `connection()` is only needed when no
  request-time API is used
- 2026-11-04: `prisma/seed.ts`, its Prisma config entry and
  `src/lib/demo-user.ts` are removed, so nothing can recreate the demo user. This
  supersedes the 2026-11-01 entries on the seed and the demo-user stub
- 2026-11-04: `getSession()` is wrapped in React `cache()`, so `UserMenu` and the
  page share one session query per render. It has no effect in Server Actions,
  which still validate the session on every call
- 2026-11-04: "Update status" is disabled while the selected status equals the
  current one. This is UI only: the server keeps the no-op rule, because a stale
  tab can still send the current status. Without JavaScript the button stays
  disabled, so status changes need JavaScript
- 2026-11-04: every Server Action with form state returns one type,
  `ActionResult` in `src/lib/action-result.ts`: `{ ok: true, data }` or
  `{ ok: false, error, values? }`, where `error` holds an optional `message` and
  `fieldErrors`. `values` sits beside `error` because submitted values aren't an
  error. Its type excludes the password, so sending one back is a type error.
  The `useActionState` initial state is `null`, because nothing submitted is
  neither a success nor a failure
- 2026-11-04: actions that end in `redirect()` use `ActionResult<never, …>`. They
  only ever return failures; success is the redirect
- 2026-11-04: expected failures (validation, a failed save) are returned as
  `ActionResult`. Unexpected ones are thrown to `src/app/error.tsx`, which shows a
  generic message and a retry and never shows the error or its digest. Real
  errors go only to server logs
- 2026-11-04: the header lives in the `src/app/(main)` route group, not the root
  layout, so `app/error.tsx` covers it. A form action's error reaches the nearest
  boundary above the form, and `error.tsx` doesn't catch errors from the layout at
  its own level: in the root layout, a failed sign-out or session read skipped
  `error.tsx` and showed Next's built-in error page (confirmed in a production
  build). The rejected alternative was `global-error.tsx`, which replaces the
  whole document. The root layout now has nothing that can throw at runtime, so
  `global-error.tsx` isn't needed. The cost: an unmatched URL shows the default
  404 without the header
- 2026-11-04: `createApplicationAction` and `changeStatusAction` read the session
  through `tryGetCurrentUserId()`, which returns `null` when the read fails and
  still redirects when there is no session. In an outage the session read fails
  first; without this the action would throw and the form would lose its values.
  `src/lib/current-user.ts` stays the only source of `userId`
- 2026-11-04: `signOutAction` has no form state: it logs a failure and rethrows it
  to `error.tsx`. `auth.api.signOut` catches its own database errors, clears the
  cookie and returns success, so during an outage the user lands on `/sign-in` and
  the catch doesn't run. The session row stays valid until it expires (at most 7
  days). Accepted: changing it needs a different sign-out flow
- 2026-11-04: forms need JavaScript. On partially prerendered pages a form POST
  without JavaScript gets only streaming scripts back, with no HTML form
- 2026-11-05: salary accepts decimal digits only, up to the Postgres `INTEGER`
  maximum, so `1e9`, `0x10` and overflow get a field error instead of a coerced
  value or a generic save failure
- 2026-11-05: text that reaches the database rejects NUL bytes, which Postgres
  text can't hold: a field error in forms, the not-found response for an
  application id
- 2026-11-05: session cookies are `Secure` whenever `NODE_ENV` is `production`
  (`advanced.useSecureCookies`), not derived from `BETTER_AUTH_URL`, so an
  `http://` value can't silently drop the flag
- 2026-11-06: salary currency is checked for the three-letter format only, not
  against the ISO 4217 list, so an unassigned code such as `ZZZ` is accepted. This
  narrows "any ISO 4217 code" in the 2026-11-02 currency entry
- 2026-11-06: the M3 unit test for the status-change transaction runs against a
  mocked `db`. It shows that a no-op writes nothing, what gets written, and that
  errors reach `$transaction`. It does not prove rollback, the `FOR UPDATE` lock,
  or `changedAt` and `updatedAt`; these need a real database and are checked once
  the test database exists (M3, week 3 day 3)
- 2026-11-06: editing lives on a separate route, `/applications/[id]/edit`, opened
  from an Edit link on the detail page; delete stays on the detail page. The
  rejected alternative was `?edit=1` on the detail page, which keeps the status
  form and history visible while editing. This narrows "adds editing to this
  page" in US-3 and US-4
- 2026-11-06: delete is confirmed in a native `<dialog>` opened with `showModal()`,
  with no library. The form sits inside the closed dialog, so it can't be submitted
  before hydration. The rejected alternatives were `window.confirm`, whose form is
  exposed in the server HTML, and an inline two-step button
- 2026-11-06: edit and delete use `updateMany` and `deleteMany` with
  `where: { id, userId }`, so ownership is checked in one statement and a miss is
  `count: 0`. `update` and `delete` throw `P2025` instead. `updateApplication` lists
  its columns by hand and writes a cleared optional field as `null`, because
  Prisma skips `undefined`
- 2026-11-06: saving the edit form without changes still changes `updatedAt`. The
  US-3 no-op rule covers status only, and skipping the write would need a read and
  a comparison
- 2026-11-06: the edit and delete actions call `refresh()` before `redirect()`:
  `redirect()` alone keeps the client cache, so Back could show old or deleted
  data. This differs from the create action, which only redirects
- 2026-11-06: the real-database checks from the entry above also cover US-4: a
  cleared field is stored as `NULL`, the status isn't touched by an edit, `updatedAt`
  changes, and delete cascades to the status history
- 2026-11-08: e2e tests run with Playwright against `next build` + `next start`
  on `http://localhost:3100`, Chromium only. Production mode tests the behavior
  users get: the PPR shell, the soft 404, and `Secure` `__Secure-` session
  cookies, which Chromium accepts on `http://localhost`. The rejected alternative
  was `next dev`, which drops `Secure`, compiles on demand and adds dev-only
  behavior. The cost is a full build on every run
- 2026-11-08: e2e tests use a separate database, `job_tracker_e2e`. `.env.test` is
  loaded only by `e2e/env.ts`, which overrides `DATABASE_URL`,
  `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from the file and refuses to run
  unless the database name is `job_tracker_e2e`. The reset SQL checks
  `current_database()` again. No command names the file, so the dev `.env` can't
  be used
- 2026-11-08: every e2e run applies migrations (`prisma migrate deploy` in the
  webServer command, because Playwright starts the webServer before
  `globalSetup`), then global setup truncates all tables, and a Playwright setup
  project re-creates two users (A and B) through the real sign-up form.
  In-process seeding with `auth.api` was rejected: Playwright's loader can't
  import the generated ESM Prisma client (`import.meta`), and switching the repo
  to `"type": "module"` is too wide. Raw password hashes were rejected because
  they bypass Better Auth
- 2026-11-08: the stale-cookie e2e test (M3) must use the production cookie name
  `__Secure-better-auth.session_token`
- 2026-11-08: cross-user isolation e2e tests use two fresh users per test, so
  the seeded USER_B was removed; the seed creates only USER_A
- 2026-11-09: the real-database checks from the 2026-11-06 entries live in
  `*.db.test.ts` and run with `npm run test:db`, a separate Vitest config that
  is not part of `npm test`. They call the DAL against `job_tracker_e2e`, with
  the env loaded only through `e2e/env.ts` (same guard), and apply migrations
  first. Each test creates its own raw `User` row and data, with no truncate.
  Rollback is injected by a test-only trigger, created and dropped by the test,
  that rejects history inserts for a marker company. The lock check holds the
  row in a third transaction until both calls are blocked on it. `test:db` must
  not run alongside `npm run e2e`, whose setup truncates every table
- 2026-11-09: a signed-in user who opens `/sign-in` or `/sign-up` is redirected
  to `/` by `RedirectIfSignedIn`, a server component that reads the real session
  inside `<Suspense>`. The form stays in the static shell, and a failed session
  read is logged on the server and still shows the form. The redirect fires
  mid-stream, so it is client-side (HTTP 200, then `/`), not a 307. Not in the
  proxy: it only sees that a cookie exists, so a stale cookie would loop between
  `/sign-in` and `/`. Covered by `e2e/auth-redirect.spec.ts`, including a stale
  `__Secure-` cookie. This closes the open question on redirecting signed-in
  users
- 2026-11-11: the status filter from US-6 is pulled forward from M5 into M3 as a
  course exercise. It covers multiple selection, state in the URL query string and
  the "No applications match your filters" message with a way to clear them.
  Search, the date range and the kanban stay in M5. The URL repeats one key with
  lowercase values (`?status=applied&status=interview`), which a native GET form
  produces without JavaScript. Values are trimmed and matched case-insensitively; unknown,
  empty and duplicate values are ignored, and if none is valid, no filter applies.
  There is no redirect to a canonical URL: it would fire mid-stream and add a round
  trip for no gain. The filter is a `next/form` GET to `/` with checkboxes, an
  Apply button and a Clear link, not auto-submit on change (same reason as the
  2026-11-02 status-select entry). Like the rest of the page, the filter needs
  JavaScript: the list and the form stream inside `<Suspense>`, which shows only
  the skeleton without it (see 2026-11-04). The form reads `searchParams`, so it renders
  inside the list's `<Suspense>` and the header stays in the static shell. The
  checkboxes use `defaultChecked`, so a wrapper element around the form is keyed
  on the selected statuses to re-mount it after Back, Forward or Clear; the key is
  not on `<Form>`, which doesn't support `key` with a string `action`.
  `listApplications` takes an optional `statuses` list and adds `status IN (…)`
  only when it is non-empty, because Prisma's `in: []` matches nothing; the
  `userId` scope, the archived exclusion and the US-2 order are unchanged. With no
  filter and no rows the list keeps the "Add your first application" call to
  action. The rejected alternative was a comma-separated value, which needs client
  code to build
- 2026-11-12: US-8 archive. "Show archived" shows active and archived
  applications together, not archived only, because the list stays one place to
  see everything. It is a checkbox in the existing GET filter form
  (`?archived=1`, applied with Apply, combined with the status filter), so it
  survives a reload and needs no client code; the rejected alternative was a
  separate link that switches it immediately. Archived rows keep the US-2 order
  and get an "Archived" badge, with no date, in the list and on the detail page
- 2026-11-12: archive and unarchive are plain buttons with no confirmation,
  because both are reversible, and the user stays on the detail page (refresh,
  like a status change). They are separate intents, not a toggle, so a stale tab
  can't flip the state the wrong way; repeating the current state is a no-op
  that leaves `archivedAt` and `updatedAt` unchanged (same idea as the US-3
  status no-op)
- 2026-11-12: an archived application can still be edited, change status (with
  history as usual; it stays archived) and be deleted
- 2026-11-12: when all of a user's applications are archived, the default list
  shows "All your applications are archived" with a link that turns on "Show
  archived", instead of the "Add your first application" call to action
- 2026-11-12: US-8 in M4 covers the list and the detail page. Excluding archived
  applications from the board and search belongs to US-5 and US-6 (M5)

## 11. End-to-end verification

- Create an application, open its detail page, change its status, reload the
  page: both changes persist and the status history shows the initial Wishlist
  record and the change with timestamps
- A job URL with a `javascript:` scheme is rejected with a field error
- `npm run lint` and `npm run typecheck` pass
- (from M2) Signed in as user B, every action on user A's application that
  exists at that milestone shows the not-found UI and leaves it unchanged:
  open and status change (M2), plus edit and delete (M3), plus archive and
  unarchive (M4). The response is the same as for an id that does not exist
- (from M3) Edit an application and reload: changes persist; delete it: it is
  gone from the list and its URL shows the not-found UI
- (from M4) Archive an application: it disappears from the list, appears with
  "Show archived" marked as archived, and unarchive restores it. (from M5) It is
  also hidden from the board and search
- (from M5) Move a card on the board by drag-and-drop and by keyboard: status
  and history update in both cases; search + status + date filters combine and
  survive a reload
- (from M6) Paste a job posting: the form is pre-filled, nothing is saved until
  the user submits; the eval script reports per-field accuracy against targets
- 2026-11-01: dates are shown in the browser's local timezone by a `LocalDate`
  client component (`Intl.DateTimeFormat`, no date library): an inline script
  corrects the server-rendered text before first paint on full page loads, and
  the component formats in the browser on client-side navigations
