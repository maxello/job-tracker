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
- An id that does not exist or belongs to another user returns 404 (never 403),
  so the existence of other users' records is not revealed

### US-0 Sign up / sign in (M2)

As a job seeker, I want to sign up and sign in, so that my applications are private and available only to me.

- A user can register and sign in; signing out ends the session (auth library
  and method are decided in week 2, see Open questions)
- Unauthenticated users are redirected to the sign-in page
- After sign-in, every page and action shows only the current user's data
- Every action on another user's application that exists at the current
  milestone (via UI or by swapping the id in a request) returns 404 and changes
  nothing: open and change status from M2, edit and delete from M3, archive and
  unarchive from M4
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
  - salary min / salary max (optional, non-negative integers, annual gross
    only; if both are set, min ≤ max)
  - salary currency (required if any salary value is set, ISO 4217 code, e.g.
    "USD", "EUR", "UAH")
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
  US-4 (M3) adds editing and deleting to this page
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
- All fields can be edited with the same validation as US-1; editing fields
  does not write status history
- Delete asks for confirmation; after deletion the user returns to the list
  and the application no longer appears anywhere in the UI (soft or hard
  delete is decided in week 2, see Open questions)

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

- Search by company and role: case-insensitive, substring match
- Filter by status (multiple selection) and by last updated date range
  (from / to, both optional, inclusive, in the user's local timezone)
- Search and filters can be combined (AND)
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

- An application can be archived from the detail page and unarchived from it
- Archiving does not change the status and does not write status history
- Archived applications are hidden from the list, kanban board and search
  results by default; a "Show archived" toggle in the list shows them, marked
  as archived
- An archived application's detail page stays accessible and editable
- Archive and unarchive follow the same ownership rules as US-0

## 5. Data model (draft)

```text
User(id, email, ...auth fields): exact shape depends on the auth library
  chosen in week 2
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
| Data    | Postgres on Neon via Prisma: User (+ auth library models), Application, StatusChange                                    |
| Access  | Auth (library chosen in week 2) + owner check on every request through a data access layer                              |
| AI      | Claude API, called from server code only (M6)                                                                           |
| Quality | Vitest (unit), Playwright (e2e); from M7: CI and error monitoring                                                       |
| Deploy  | From M7: Vercel, preview deployment for every PR, each preview uses its own Neon branch (never the production database) |

Code layout: `src/features/applications/` with `components/`, `actions.ts`,
`schemas.ts`, `queries.ts`.

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
  tests for M1–M3 stories; hooks enforce lint and typecheck
- M4 (week 4): archive application (US-8)
- M5 (week 5): kanban board + search and filters
- M6 (week 6): AI job posting parsing + eval script
- M7–M8 (weeks 7–8): deploy, preview deployments, CI, monitoring, portfolio prep

## 9. Open questions

- Soft delete or hard delete? (decide in week 2, day 1)
- Auth library (Better Auth or Auth.js) and method (email + password or OAuth);
  if email + password, are password reset and email verification in scope?
  (decide in week 2, day 2)
- Should the create form allow choosing an initial status other than Wishlist?

## 10. Decision log

- 2026-10-30: application status is a Prisma enum, not a separate table
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

## 11. End-to-end verification

- Create an application, open its detail page, change its status, reload the
  page: both changes persist and the status history shows the initial Wishlist
  record and the change with timestamps
- A job URL with a `javascript:` scheme is rejected with a field error
- `npm run lint` and `npm run typecheck` pass
- (from M2) Signed in as user B, every action on user A's application that
  exists at that milestone returns 404 and leaves it unchanged: open and status
  change (M2), plus edit and delete (M3), plus archive and unarchive (M4)
- (from M3) Edit an application and reload: changes persist; delete it: it is
  gone from the list and its URL returns 404
- (from M4) Archive an application: it disappears from the list, board and
  search, appears with "Show archived", and unarchive restores it
- (from M5) Move a card on the board by drag-and-drop and by keyboard: status
  and history update in both cases; search + status + date filters combine and
  survive a reload
- (from M6) Paste a job posting: the form is pre-filled, nothing is saved until
  the user submits; the eval script reports per-field accuracy against targets
- 2026-11-01: dates are shown in the browser's local timezone by a `LocalDate`
  client component (`Intl.DateTimeFormat`, no date library): an inline script
  corrects the server-rendered text before first paint on full page loads, and
  the component formats in the browser on client-side navigations
