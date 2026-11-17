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
- A distinct, consistent visual identity: one set of design tokens, light and
  dark themes, responsive from 360px, motion that respects reduced motion

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
  delete from M3, archive and unarchive from M4, moving a card on the board
  from M5 (where the not-found response is the "This application no longer
  exists" message, the same as for a missing id)
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
- Empty state: "No applications yet." with an "Add your first application"
  button; the order of empty states is in US-6
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

- The board lives at `/board`. Both `/` and `/board` show a view switcher
  above the content: a `<nav aria-label="Views">` with two links, "List" (`/`)
  and "Board" (`/board`), with `aria-current="page"` on the current one,
  visible at every width. The links are plain `/` and `/board`: list filters
  are not carried over. The header doesn't change. From `lg`, on `/` the
  switcher sits above the list column, not above the whole grid, so it doesn't
  push the filter column down. On both pages the order is: the page header
  row, the "Views" nav, then the content; on `/` below `lg` the nav sits
  between the header row and the filter form
- `/board` has the `h1` "Board", the page title "Board" and the same "New
  application" button as `/`
- One column per status; archived applications are never shown on the board.
  The board has no filters in M5: it shows all non-archived applications
- Cards within a column are ordered by last updated, newest first (no manual
  ordering)
- The five columns are always shown, also when empty, because they are drop
  targets. Each column header shows its count (e.g. "Applied · 3"). The board
  has no pipeline bar
- When the user has no non-archived applications, the board shows the same
  empty state as US-6 states 2 and 3 instead of the columns; for state 2 the
  link goes to `/?archived=1`, because the board has no "Show archived"
- A card shows company, role and last updated. The company name links to the
  detail page; the card itself is not a link. The card carries the status edge
  (Offer tinted), like a list row, and no status badge: the column header
  names the status
- Cards can be moved between columns with native HTML drag-and-drop (no
  library). The whole card is the drag source; the company link is not
  draggable on its own, so dragging it moves the card. Drag-and-drop on touch
  devices is not guaranteed: on phones the primary path is the status select
  and "Move". The draggable card must not break its inner select (checked in
  Firefox)
- Keyboard and screen-reader alternative: each card has a status select and a
  "Move" button that perform the same move, with the same rules as the detail
  page (US-3): no auto-submit, and the button is disabled while the selected
  status equals the current one. The select has the visible label "Status"
  and the accessible name "Status for {company}, {role}"; the button's
  accessible name is "Move {company}, {role}". Their ids derive from the
  record id (#26)
- After a successful "Move", focus goes to the moved card's status select in
  its new column. After any other failure the card returns and focus stays on
  its select
- Dropping a card into the column it is shown in sends no request: for the
  user it isn't a move, the same as the disabled "Move" button. The
  server-side no-op from US-3 stays for stale tabs
- Each move changes the status and writes a history record (same rules as US-3)
- A moved card is placed first in its new column (the move updates `updatedAt`
  and the order is newest first), so it doesn't jump after the refresh
- The move is shown optimistically
- Several moves can be in flight at once, each card on its own: while a
  card's move is pending, that card can't be dragged and its select and
  "Move" button are disabled. Two quick moves of different cards both stay
  after the refresh
- A successful move, by either path, shows "Moved {company} ({role}) to
  {status}."
- If the application no longer exists or belongs to another user (one
  response for both, never "forbidden"), the card disappears from the board
  after a refresh and the message "This application no longer exists" is shown
- On any other failure the card returns to its previous column and a generic
  error message is shown
- Messages appear in one live region above the board and stay until the next
  move; with several moves in flight, it shows the result of the latest one
- The board and the detail page still go through one server action and one
  data access layer function (US-3), and the detail page keeps its not-found
  UI. The action must not answer the board with `notFound()`, which would
  replace the whole board with the not-found UI. Instead it returns a
  not-found result to every caller, and the detail page's status form calls
  `notFound()` itself while it renders, which shows the same not-found UI
- Columns have a minimum width of 13rem, so the five fit the 1120px page;
  at 13rem a card's select and "Move" button fit without being clipped
  (checked with a screenshot). When the five columns don't fit, the board
  container scrolls horizontally, at any width; the page itself never scrolls
  horizontally. Below 768px the board shows one column per screen width
  (scroll snap)
- The loading skeleton shows the five column frames with the real column
  names as visible text; the counts and cards pulse. It keeps the same
  positions as the loaded board
- (end of M5, motion, on its own branch after the board is merged) With `prefers-reduced-motion`, view transitions and
  micro-interactions are off or reduced to a fade; dragging a card still
  follows the pointer. Whether drag-and-drop conflicts with view transitions
  is checked on the working board and recorded in the decision log (see the
  2026-11-14 entry)

### US-6 Search and filters (M5)

As a job seeker, I want to search and filter my applications, so that I can quickly find the ones I need.

The status filter (multiple selection, URL state, the empty-result message) is
pulled forward into M3; search and the date range stay in M5 (see the decision
log, 2026-11-11).

- Search by company and role: case-insensitive, substring match
  - One input matches company OR role
  - The whole trimmed text is one phrase (substring), not separate words
  - `%` and `_` match literally
  - Case-insensitive also for non-Latin letters such as Cyrillic
- Filter by status (multiple selection) and by last updated date range
  (from / to, both optional, inclusive, in the user's local timezone)
- The filter form adds the browser's IANA time zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to the URL as `tz`, and
  the server computes the day boundaries in that zone. A missing or invalid
  `tz` falls back to UTC with no error. A bookmark gives the same result
  anywhere, because the zone is in it
  - `tz` is a hidden input, sent on every Apply, also with no dates. Before
    hydration it is empty, so a submit then filters in UTC (forms need
    JavaScript, see the decision log, 2026-11-04)
  - `tz` is valid when `Intl.DateTimeFormat` accepts it as `timeZone` after
    trimming (aliases, any case, `UTC` and offsets such as `+02:00` included).
    Only the first `tz` value counts, like `q`. The validity check and the
    day-boundary computation share one function, so an accepted zone can
    always be computed
  - `tz` alone is never a filter: it doesn't count for empty state 1
- URL parameters follow the same rules as `status` and `archived` (values
  trimmed, invalid ones ignored, no redirect):
  - `q`: the search text. Ignored when empty or whitespace only, longer than
    200 characters (the US-1 limit for company and role) or containing a NUL
    byte. The length is counted after trimming, in UTF-16 code units (as Zod's
    `.max(200)` counts). Only the first `q` value counts: if it is invalid,
    there is no search, and later values are never tried. Internal whitespace
    is kept as typed, and the text is not Unicode-normalized. An empty search
    input submits `q=`, which is ignored like any empty value
  - `from` and `to`: `YYYY-MM-DD`, as `<input type="date">` sends them. An
    invalid date is ignored. Both are inclusive days in the `tz` zone
    - Valid means strictly `YYYY-MM-DD`, a real calendar date (`2026-02-30`
      is invalid) and a year from 0001 to 9999. Only the first value of each
      counts, like `q`
    - When one date is valid and the other isn't, the valid one still
      applies, and it alone makes the filter active for empty state 1
  - `from` later than `to` gives an empty result with the usual "No
    applications match your filters", never a silent swap. This applies only
    when both are valid
- The search input is `<input type="search" name="q" maxLength={200}>` with
  the visible label "Search company or role" (no placeholder, no helper text),
  at the top of the filter column, above the Status fieldset. After a reload,
  Back or Forward between list URLs it shows the parsed value: the trimmed
  text, or empty when `q` was ignored, so text typed but not applied is
  dropped. Returning to the list from another page that Next still preserves
  restores the unapplied draft, by design; Clear while already on `/` keeps
  it too (see the decision log, 2026-11-17)
- The date range is a `<fieldset>` with the legend "Updated" (the word the
  list rows use for this date) between the Status and Archive fieldsets,
  holding two `<input type="date">` labelled "From" (`name="from"`) and "To"
  (`name="to"`), with no `min` or `max`. Like search, after a reload, Back or
  Forward between list URLs they show the parsed value, or are empty when the
  value was ignored. Like search and the status checkboxes, an unapplied date
  is restored when returning to the list from another page that Next still
  preserves, and Clear while already on `/` keeps it (see the decision log,
  2026-11-17)
- The Clear link (`/`) resets everything: search, dates, statuses and "Show
  archived"
- The whole filter column, including Apply, fits a 1024×700 viewport, with
  search, the dates and the status counts
- Search and filters can be combined (AND)
- Archived applications are excluded from search results unless "Show
  archived" is on (US-8)
- Search and filter state is stored in the URL query string, so it survives a
  reload and can be bookmarked
- Empty states, in this order (the first that applies wins). "Show archived"
  doesn't count as a filter here:
  1. At least one filter is active (status, `q`, `from` or `to`, counting
     valid values only) and nothing matches: "No applications match your
     filters" with "Clear filters". This applies even when the user has no
     applications at all; Clear then leads to state 3
  2. No filter is active, "Show archived" is off, and every application is
     archived: "All your applications are archived" with a "Show archived"
     link
  3. Otherwise: "No applications yet." with an "Add your first application"
     button
- Status counts: each status checkbox shows how many of my applications have
  that status. The counts respect only "Show archived": search, the selected
  statuses and the date range don't change them. A status with none shows 0
- A pipeline bar above the list shows the same counts as segments in the
  status colours, one per status with at least one application. The bar is
  decorative (hidden from assistive technology); a text legend next to it
  gives each status with its count. The bar and the legend show only when at
  least one count is greater than 0 under the current "Show archived"
  setting; otherwise neither is shown (this covers no applications at all and
  all archived with "Show archived" off). The status checkboxes still show
  their counts, including 0
- The loading skeleton includes the bar and the counts; the list and the
  filter column have the same positions in the skeleton and in the loaded page.
  The skeleton includes the date fieldset from the date-range branch, before
  the counts and the bar ship

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
- Archived applications are hidden from the list and search results by
  default, and never shown on the kanban board. In M4 this covers the list;
  the board and search exclude them from M5 (US-5, US-6). "Show archived"
  applies to the list only
- "Show archived" is a checkbox in the list's filter form, stored in the URL
  (`?archived=1`) and applied with Apply, like the status filter, and combined
  with it. It shows active and archived applications together, in the US-2
  order (last updated, newest first). Archived rows get an "Archived" badge
  next to the status badge, with no date
- Empty states follow the order in US-6: a user whose applications are all
  archived sees "All your applications are archived" with a link that turns
  on "Show archived"
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
- Before M5: visual identity (design tokens, fonts, restyle of the existing
  screens); the criteria are in `docs/design-brief.md`
- M5 (week 5): kanban board + search and filters; motion (view transitions,
  micro-interactions) after the board works
- M6 (week 6): AI job posting parsing + eval script
- M7–M8 (weeks 7–8): deploy, preview deployments, CI, monitoring, portfolio prep
  - Required before the public deploy (M7): rate limiting for sign-in and sign-up,
    the sign-out behavior when the database fails, security headers (see Open
    questions)
  - Required by the end of M8: open tabs react when the account changes (see Open
    questions)

## 9. Open questions

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
- 2026-11-01: dates are shown in the browser's local timezone by a `LocalDate`
  client component (`Intl.DateTimeFormat`, no date library): an inline script
  corrects the server-rendered text before first paint on full page loads, and
  the component formats in the browser on client-side navigations
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
- 2026-11-12: archive and unarchive are two Server Actions,
  `archiveApplicationAction` and `unarchiveApplicationAction`, not one action
  with an intent field: the id is the only submitted field, so a forged request
  can't turn one into the other. Both read the session through
  `tryGetCurrentUserId()`, answer a missing or foreign id with `notFound()`, and
  call `refresh()` on success, also on a no-op, so a stale tab catches up. The
  DAL writes with `updateMany` where `{ id, userId }` plus the opposite archive
  state (`archivedAt: null` to archive, `{ not: null }` to unarchive), so a
  repeat matches nothing and `@updatedAt` doesn't change. When nothing matched,
  an owner-scoped `findFirst` tells "already in that state" from "not found".
  The two statements are not a transaction: a concurrent change between them can
  only change that label, never the data. `archivedAt` is set from the app
  server clock (`new Date()`), like `@updatedAt`
- 2026-11-12: "Show archived" is read from `archived` in the query string: on
  when any value is `1` after trimming, otherwise ignored with no redirect, like
  the status filter. The Clear link (`/`) clears both filters. The filter form
  has two `<fieldset>`s side by side, each with its legend on the border:
  "Status" with the status checkboxes and "Archive" with "Show archived", so
  "Show archived" isn't announced as a status. Clear and Apply follow them,
  aligned right. The rejected alternative was one box with the status
  checkboxes as a `role="group"`, which lost the legend on the border.
  `hasArchivedApplications` runs only when the default list (no filters,
  archived hidden) comes back empty
- 2026-11-12: after Archive, focus moves to the Unarchive button, and after
  Unarchive to the Archive button, so keyboard and screen-reader users don't
  lose their place when the form swaps. `ArchiveForm` stays mounted across
  `refresh()` and holds one keyed child form per action; a click sets a flag,
  and an effect on the archived state moves focus only when that flag is set,
  so a page load never takes focus. A failed action clears the flag
- 2026-11-12: DOM ids are never hard-coded (#26). Cache Components keeps up to
  3 previous routes per route level in the document, hidden with `<Activity>`,
  so a fixed id appears twice and labels and ARIA references attach to several
  elements. Client Components derive ids from `useId()`. Server Components
  derive them from the record id: `useId()` there restarts its counter on every
  RSC request (Next sets no `identifierPrefix`), so two routes would get the
  same ids
- 2026-11-13: from `lg` (1024px) the filter form is a sticky column left of
  the list (#27); this supersedes the layout part of the 2026-11-12 "Show
  archived" entry on desktop. The "Status" and "Archive" fieldsets stack, one
  checkbox per line, with Clear and Apply below them, aligned right. The
  column has a fixed width (11rem) and aligns to the start of the row, so it
  sticks instead of stretching to the list's height; the list cell is
  `minmax(0,1fr)` so long names still truncate. Below `lg` the layout is
  unchanged and nothing is sticky. The page stays `max-w-3xl`, not wider
  (product decision; checked by hand that the list is still readable). Markup
  order, tab order, the GET form and the keyed re-mount are unchanged, and the
  skeleton mirrors both layouts. The whole column, including Apply, must fit a
  1024×700 viewport, also when M5 adds search and the date range. The layout
  is covered by `e2e/filter-layout.spec.ts`; sticky is checked by hand
- 2026-11-14: the visual identity (design tokens, fonts, restyle of the
  existing screens) ships before M5, so the kanban is built in the final style;
  motion (view transitions, micro-interactions) comes after the kanban works,
  because it depends on the final DOM and must be checked against drag-and-drop
- 2026-11-14: the visual direction is "Signal" (`docs/design-brief.md`):
  colour is used only for status (a coloured edge on every row, the text badge
  stays), Archivo and Martian Mono. The rejected candidates and why are in the
  brief. The theme follows the system preference only; there is no toggle
- 2026-11-14: the page widens from `max-w-3xl` to 1120px and, from `lg`, the
  filter column from 11rem to 14rem; this supersedes those two parts of the
  2026-11-13 entry. Clear and Apply sit at the bottom of the column on one
  line, Clear left and Apply right. Unchanged: markup order, tab order, the
  sticky column, the stacked fieldsets, and the whole column fitting a
  1024×700 viewport
- 2026-11-14: the header shows the logo (five status-coloured bars and "Job
  Tracker", not a link). Signed in, below `sm` (640px) the email and Sign out
  move into an account menu; from `sm` they stay inline. The trigger is a 44px
  circle with the email's first letter, accessible name "Account menu". The
  menu uses the Popover API (`popovertarget`, `popover="auto"`) with no client
  JS. Its id is a fixed `account-menu`, an exception to the 2026-11-12 "DOM ids
  are never hard-coded" entry, allowed only in `src/app/(main)/layout.tsx`,
  which renders once per document; pages and their components still follow
  #26. Signed out, Sign in and Sign up stay inline at every width. Covered by
  `e2e/account-menu.spec.ts`
- 2026-11-16: the board (US-5) has its own route, `/board`, and both `/` and
  `/board` show a "Views" nav with "List" and "Board" links above the content,
  at every width; the links don't carry list filters over, and the header
  doesn't change. Rejected: a list/board toggle on `/` stored in the URL (one
  page doing two jobs), and navigation in the header or a hamburger menu (it
  hides the two main views behind a tap on mobile and crowds the header at
  360px)
- 2026-11-16: the board has no filters in M5 and shows all non-archived
  applications; archived applications never appear on it, and "Show archived"
  applies to the list only. "Search results" is the list on `/` with search
  parameters, not a separate surface. Rejected: filters on the board (a status
  filter on a board grouped by status adds little, and it doubles the M5
  scope)
- 2026-11-16: a board card shows company, role and last updated, and only the
  company name links to the detail page. Columns have a minimum width; when the
  five don't fit, the board container scrolls horizontally at any width and the
  page never does (generalizes the below-768px rule). Rejected: the whole card
  as a link (it would nest controls inside a link and clash with dragging)
- 2026-11-16: the board's keyboard and screen-reader alternative is a status
  select plus a "Move" button on every card, with the detail page's rules (no
  auto-submit, button disabled while the selection equals the current status),
  accessible names that include company and role, and ids derived from the
  record id (#26). Rejected: the drag-and-drop library's keyboard mode (the
  criterion would depend on a library not chosen yet, and its announcements on
  that library)
- 2026-11-16: when a board move hits a missing or foreign id (one response for
  both, never "forbidden"), the card disappears after a refresh and the board
  shows "This application no longer exists"; any other failure returns the
  card to its previous column with a generic error. Messages go to one live
  region above the board and stay until the next move. The board and the
  detail page keep one server action and one DAL function (US-3); the action
  must not answer the board with `notFound()`, and how it reports not-found is
  decided in the M5 plan. Rejected: returning the card to its column for a
  missing or foreign id (the application no longer exists for this user), and
  answering the board with the action's `notFound()` (it replaces the whole
  board)
- 2026-11-16: dropping a card into the column it is shown in sends no request;
  the US-3 server-side no-op stays for stale tabs. A moved card is placed
  first in its new column, matching the newest-first order after the refresh.
  Rejected: sending the drop into its own column to the server (nothing
  changes for the user; the server no-op already covers stale tabs)
- 2026-11-16: the cross-user e2e check gains "(from M5) user B's board shows
  none of user A's cards". Rejected: a separate e2e check that user B moves
  user A's card (the board uses the same action as the detail page, already
  covered from M2)
- 2026-11-16: the date range uses the browser's IANA time zone, which the
  filter form adds to the URL as `tz`; the server computes the day boundaries
  in that zone, and a missing or invalid `tz` falls back to UTC with no error.
  No date library (same as the `LocalDate` entry); how the boundaries are
  computed is decided in the M5 plan. Rejected: a cookie (the result of a
  bookmark would depend on who opens it, and the first request may have no
  cookie), UTC day boundaries (contradicts US-6: late-evening edits would land
  in the next day), and filtering on the client (the list is rendered on the
  server)
- 2026-11-16: the search and date parameters are `q`, `from` and `to`, with the
  same rules as `status` and `archived` (trimmed, invalid values ignored, no
  redirect). `q` is ignored when empty, whitespace only, over 200 characters
  or containing a NUL byte; `from` and `to` are `YYYY-MM-DD`, inclusive days in
  the `tz` zone; `from` later than `to` gives an empty result. Rejected:
  swapping `from` and `to` silently (magic the user didn't ask for), and a
  redirect to a canonical URL (same reason as the 2026-11-11 status filter
  entry)
- 2026-11-16: one search input matches company OR role, the whole trimmed text
  is one substring phrase, `%` and `_` match literally, and matching is
  case-insensitive also for non-Latin letters such as Cyrillic. Whether
  Prisma's `contains` escapes `%` and `_`, and how case-insensitive matching
  handles Cyrillic in our database, is checked in the M5 plan, not assumed.
  Rejected: matching separate words (more complex, no story needs it), and `%`
  and `_` as wildcards (users type them as text)
- 2026-11-16: the Clear link (`/`) resets everything: search, dates, statuses
  and "Show archived"; this extends the 2026-11-12 Clear rule from "both
  filters" to all of them. The whole filter column, including Apply, must still
  fit a 1024×700 viewport, now including search, the dates and the status
  counts. From `lg`, the view switcher on `/` sits above the list column, not
  above the whole grid, so it doesn't push the filter column down. If the
  column still doesn't fit, the M5 plan solves it with a screenshot. Rejected:
  relaxing the 1024×700 rule in advance (decide with a screenshot once the real
  column exists)
- 2026-11-16: the no-applications empty state is "No applications yet." with
  an "Add your first application" button, described the same way in US-2 and
  US-8. No alternatives were considered: this aligns the spec text with what
  ships
- 2026-11-16: empty states follow one order (US-6): active filters with no
  match ("No applications match your filters" with "Clear filters", even when
  the user has no applications), then all archived with "Show archived" off,
  then "No applications yet."; "Show archived" doesn't count as a filter. The
  board always shows its five columns, also when empty, and shows the same
  empty state as states 2 and 3 instead of the columns when the user has no
  non-archived applications, linking state 2 to `/?archived=1`. Rejected: a
  separate message for "filters on, but no applications at all" (rare, and
  Clear leads to the right message), and hiding empty columns on the board
  (they are drop targets)
- 2026-11-16: the pipeline bar and its legend show only when at least one
  count is greater than 0 under the current "Show archived" setting; the
  status checkboxes still show 0. The board has no pipeline bar; each column
  header shows its count (e.g. "Applied · 3"). Rejected: an empty bar frame
  when all counts are 0 (it shows nothing useful), and the pipeline bar on the
  board (the columns and their counts already show the same thing)
- 2026-11-16: the create form has no status choice: a new application always
  starts as Wishlist (US-1), and the user changes the status in one step on
  the detail page; the open question is closed. Rejected: a status choice in
  the create form (the history would start somewhere other than Wishlist,
  close to the backdating non-goal)
- 2026-11-16: section 8 lists the visual identity before M5 and motion in M5,
  after the board works. This records in the milestones what the 2026-11-14
  entry already decided; the design criteria stay in `docs/design-brief.md`
- 2026-11-16: two criteria become verifiable. The US-6 loading skeleton keeps
  the list and the filter column at the same positions as the loaded page.
  Under `prefers-reduced-motion`, view transitions and micro-interactions are
  off or reduced to a fade, while dragging a card still follows the pointer
  (US-5). Rejected: "no layout shift" judged by eye (not testable), and
  banning drag animation under reduced motion (dragging follows the pointer,
  it isn't decorative motion)
- 2026-11-16: search (`q`) ships on its own branch before the date range. Only
  the first `q` value counts; if it is invalid there is no search, and later
  values are never tried. This differs on purpose from `status` (all valid
  values count) and `archived` (on when any value is `1`): search is one
  phrase, and merging or picking among several would be magic the user didn't
  ask for. The 200-character limit is counted after trimming, in UTF-16 code
  units, matching Zod's `.max(200)` for company and role and the input's
  `maxLength`. Internal whitespace is kept as typed and the text is not
  Unicode-normalized. An empty input submits `q=`, which is ignored, so no
  JavaScript strips it. The input is `type="search"` with the visible label
  "Search company or role", at the top of the filter column above Status; it
  shows the parsed value (trimmed, or empty when ignored), and `q` joins the
  form wrapper's key so Back, Forward and Clear re-mount it.
  `e2e/filter-layout.spec.ts` checks now that the whole column, including the
  search input and Apply, fits 1024×700. Rejected: a placeholder or helper
  text instead of the label (a placeholder is not a label, and the column has
  no vertical room for helper text), using the last `q` value, and collapsing
  internal whitespace
- 2026-11-16: search runs through Prisma's `contains` with
  `mode: "insensitive"` (ILIKE) on company OR role, ANDed with the `userId`
  scope and the other filters. Checked against the e2e database (Neon,
  PostgreSQL 18.7) before planning: Prisma 7.10.1 does not escape `%` and `_`
  (`100%` matched "100x Remote"), and `\` is ILIKE's escape character (`k\s`
  didn't find "back\slash"), so the DAL escapes all three with a backslash.
  The database's `C.UTF-8` locale matches Cyrillic case-insensitively
  (`ПРИВІТ` finds "Привіт"); this was checked on the e2e database only, **to
  verify on the production database at the M7 deploy**. The db tests
  (`queries.db.test.ts`, "search") pin all of this. The filter form's wrapper
  key is `JSON.stringify([sortedStatuses, showArchived, search ?? null])`.
  Rejected: raw SQL (the escaping is three characters, and raw SQL would
  bypass the typed `where` and its `userId` scope), and a separator-joined
  string key (`q` is user text, so `?archived=1` and `?q=archived` could
  collide on "|archived" and Back between them wouldn't re-mount the form)
- 2026-11-17: the filter form's wrapper key uses the raw first `q` value from
  the URL, not the parsed one. `/` and `/?q=`, or `?q=acme` and
  `?q=%20acme%20`, parse to the same search, so a parsed key kept text typed
  but not applied after Back or Forward between them (found in review;
  covered by `e2e/search.spec.ts` E9). Accepted limitation: typing and then
  clicking Clear while already on `/` (the same URL, so the same key) keeps
  the unapplied text, like unapplied checkboxes; it is inherent to the GET
  form, and fixing it needs client JavaScript. Rejected: client JavaScript
  that resets the form on Clear (a new client component for a rare case)
- 2026-11-17: returning to the list from another page (e.g. `/?q=acme`, type
  without applying, open a row, then Back) restores the unapplied search
  draft, by design. With `cacheComponents`, Next hides up to 3 previous routes
  with `<Activity>` and preserves form input values
  (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`,
  which names "a search page with filters" as a case to keep); the status
  checkboxes already behave the same. Back or Forward between list URLs still
  shows the parsed value (the raw-`q` key above). Checked by hand, not by an
  e2e test, since it pins framework behaviour. Rejected: resetting the form
  via `bfcacheId` or a client reset effect (new client code that works
  against the documented default)
- 2026-11-17: the date range (`from`, `to`, `tz`) ships on its own branch;
  the status counts and the pipeline bar ship on another. `tz` is a hidden
  input in the filter form, sent on every Apply, also with no dates, so no
  client code decides when to drop it. It gets the browser's zone after
  hydration; a submit before that sends an empty `tz` and filters in UTC,
  accepted because forms need JavaScript (2026-11-04). `tz` is valid when
  `Intl.DateTimeFormat` accepts it as `timeZone` after trimming, which also
  admits aliases, any case, `UTC` and offsets such as `+02:00`; one shared
  function both checks it and computes the day boundaries, so an accepted zone
  can always be computed. `tz` alone is never a filter. `from` and `to` are
  valid when strictly `YYYY-MM-DD`, a real calendar date, with a year from
  0001 to 9999; one valid date alone applies and makes the filter active, and
  "`from` later than `to`" applies only when both are valid. For `tz`, `from`
  and `to`, only the first value counts, like `q`. The raw first `from`, `to`
  and `tz` values join the filter form's wrapper key (same reason as the raw
  `q`, 2026-11-17): the key tells apart the list URLs the form must re-mount
  between, not only its visible fields. `tz` is needed because Apply
  replaces another zone (a bookmark, or `tz=` from a submit before
  hydration) with the browser's, so two list URLs can differ only in `tz`,
  and Back between them must still drop unapplied dates (found in review;
  covered by `e2e/date-range.spec.ts` R11). The fieldset
  has the legend "Updated", the word the list rows use for this date, sits
  between Status and Archive, and holds
  "From" and "To" date inputs with no `min` or `max`: `from` later than `to`
  is already handled by the empty result. The loading skeleton gets the date
  fieldset on this branch. An unapplied date behaves like unapplied search
  text: restored when returning from another preserved page, kept by Clear
  while already on `/` (both 2026-11-17 entries above). Rejected: the legend
  "Last updated" (the rows say "Updated"), adding `tz` only when a date is filled
  (needs client code to drop the field), IANA names only (narrower than what
  the browser and the server both accept, for no gain), and `min`/`max` on
  the inputs (client logic for a case the empty result already covers)
- 2026-11-17: accepted limitation: a bookmark with another zone's `tz` filters
  by that zone, while `LocalDate` shows dates in the browser's zone, so a row
  can show a date outside the range it was filtered by. The next Apply
  replaces `tz` with the browser's zone. Rejected: showing dates in the URL's
  zone (one more rule for a rare case; dates follow the browser everywhere
  else)
- 2026-11-17: board drag-and-drop (US-5) uses native HTML drag-and-drop, with
  no new dependency; the whole card is the drag source. Drag-and-drop on touch
  devices is not guaranteed: on phones the primary path is the status select
  and "Move" (below 768px the board shows one column per screen anyway). The
  draggable card must not break its inner select in Firefox. Rejected:
  `@dnd-kit` (`@dnd-kit/react` 0.5.3 is pre-1.0 and `@dnd-kit/core` 6.3.1 has
  had no release since Dec 2024; it would add touch dragging, but brings its
  own keyboard mode we don't use), `@atlaskit/pragmatic-drag-and-drop` (a
  layer over native drag-and-drop with the same touch limits, little gain for
  five fixed drop targets), and `@hello-pangea/dnd` (pulls in Redux, built for
  sortable lists)
- 2026-11-17: `changeStatusAction` reports a missing or foreign application,
  and an unusable id, with a not-found result instead of `notFound()`, for
  every caller. The board shows "This application no longer exists"; the
  detail page's status form calls `notFound()` while it renders, and the
  segment's not-found boundary shows the same not-found UI. Checked in the
  Next 16.4.6 source, not its docs (the `notFound` reference lists only
  Server Components, Server Functions and Route Handlers): the boundary in
  `client/components/http-access-fallback/error-boundary.js` is a client
  error boundary that catches the 404 digest from any render and renders
  `noindex` plus `not-found.js`. The `changeStatusAction` not-found unit
  tests and the status-change case of `e2e/cross-user-isolation.spec.ts`
  (HTTP 404 on the action POST) change on purpose. The other actions keep
  `notFound()`. Rejected: a hidden field from the board that switches the
  response (one action with two response modes)
- 2026-11-17: board feedback (US-5). A successful move, by either path,
  shows "Moved {company} ({role}) to {status}." in the live region. After a
  keyboard "Move", focus goes to the moved card's select in its new column;
  after any other failure the card returns and focus stays on its select.
  Several moves can be in flight at once, each card on its own; the live
  region shows the latest result. Rejected: error messages only (a screen
  reader user gets no confirmation that a drag or move worked)
- 2026-11-17: board layout (US-5). `/board` has the `h1` and title "Board"
  and the "New application" button; on both pages the "Views" nav sits
  between the page header row and the content (on `/` from `lg`, at the top
  of the list column). Columns are at least 13rem, so the five fit the
  1120px page; a screenshot confirms the select and "Move" fit unclipped.
  Cards carry the status edge (Offer tinted) and no badge; the select's
  visible label is "Status", its accessible name "Status for {company},
  {role}", the button's "Move {company}, {role}". The skeleton shows the
  column names as real text, pulses counts and cards, and keeps the loaded
  board's positions. Motion ships on its own branch after the board is
  merged. Rejected: wider columns that scroll on desktop, and a status badge
  on cards (the column header already names the status)

## 11. End-to-end verification

- Create an application, open its detail page, change its status, reload the
  page: both changes persist and the status history shows the initial Wishlist
  record and the change with timestamps
- A job URL with a `javascript:` scheme is rejected with a field error
- `npm run lint` and `npm run typecheck` pass
- (from M2) Signed in as user B, every action on user A's application that
  exists at that milestone shows the not-found UI and leaves it unchanged:
  open and status change (M2), plus edit and delete (M3), plus archive and
  unarchive (M4). The response is the same as for an id that does not exist.
  (from M5) User B's board shows none of user A's cards
- (from M3) Edit an application and reload: changes persist; delete it: it is
  gone from the list and its URL shows the not-found UI
- (from M4) Archive an application: it disappears from the list, appears with
  "Show archived" marked as archived, and unarchive restores it. (from M5) It
  never appears on the board, and search hides it unless "Show archived" is on
- (from M5) Move a card on the board by drag-and-drop and by keyboard: status
  and history update in both cases; search + status + date filters combine and
  survive a reload
- (from M6) Paste a job posting: the form is pre-filled, nothing is saved until
  the user submits; the eval script reports per-field accuracy against targets
