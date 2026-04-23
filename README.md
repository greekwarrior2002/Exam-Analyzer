# Exam Analyzer

A lean, single-user web app for grading student exams from uploaded photos
with AI assistance. Built to be deployed on **Vercel + Supabase** in a few
minutes.

> The AI **suggests** grades. You always review, edit, and approve before
> anything counts as final.

## Quickstart (about 5 minutes)

You need three accounts, all free tiers:
[Supabase](https://supabase.com) ·
[Anthropic](https://console.anthropic.com) ·
[Vercel](https://vercel.com) (only for deploying).

### 1. Create a Supabase project
- New project, any region near you, set a DB password you'll forget.
- When it's ready, open **SQL Editor → New query**, paste all of
  [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql),
  click **Run**. This creates every table, policy, and the `exams` bucket.
- **Authentication → URL Configuration** → add `http://localhost:3000` (and
  later your Vercel URL) to "Redirect URLs".

### 2. Get your keys
- Supabase → **Project Settings → API**: copy the URL, `anon` key, and
  `service_role` key.
- Anthropic → **API Keys**: create one.

### 3. Configure + run
```bash
npm install
npm run setup     # interactive — pastes keys into .env.local
npm run dev
```

Open <http://localhost:3000>, enter your email (the one you put on the
allowlist), click the magic link → you're in.

### 4. Deploy (optional)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgreekwarrior2002%2Fexam-analyzer&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ANTHROPIC_API_KEY,ALLOWED_EMAILS,NEXT_PUBLIC_SITE_URL&envDescription=Your%20Supabase%20%2B%20Anthropic%20keys%20and%20the%20single%20email%20allowed%20to%20sign%20in.&project-name=exam-analyzer&repository-name=exam-analyzer)

After deploying, set `NEXT_PUBLIC_SITE_URL` to the deployed URL and add it
to Supabase → Auth → Redirect URLs.

---

## Features

- Create assignments, define per-question rubrics (prompt, max points,
  expected answer, common mistakes, partial-credit rules).
- Drag-and-drop upload of exam pages (JPG/PNG/WebP, multi-page per student).
- Automatic OCR on upload (Claude Vision — handles handwriting).
- AI grading that returns per-question suggested score, justification,
  feedback comment, confidence, and a `needs_human_review` flag.
- Side-by-side grading workspace: image, OCR text, AI suggestion, and an
  editable score + comment.
- Autosave, keyboard shortcuts (`j`/`k` navigate, `a` approve, `r` reset).
- Low-confidence filter, OCR re-run, AI re-grade.
- Per-question analytics (class average, low/high, flagged count).
- CSV exports: grades matrix + per-student feedback summary.
- Dark mode.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS** +
  shadcn/ui-style components (Radix primitives).
- **Supabase** for PostgreSQL, Storage (private bucket), and magic-link
  auth. Row-level security on every table.
- **Anthropic Claude** for OCR (vision) and grading. Swap providers by
  editing `lib/ocr/index.ts` or `lib/ai/index.ts` — the pipeline uses a
  single-interface abstraction.

## Project structure

```
app/
  (app)/                     # Authenticated layout
    page.tsx                 # Dashboard
    assignments/
      new/page.tsx           # Create assignment
      [id]/
        page.tsx             # Assignment detail + submissions list
        rubric/page.tsx      # Rubric editor
        upload/page.tsx      # Upload submissions
        grade/[submissionId]/page.tsx  # Side-by-side grading UI
        analytics/page.tsx
        export/page.tsx
  api/
    auth/callback/           # Magic link exchange
    auth/signout/
    ocr/                     # POST: run OCR for a submission
    grade/                   # POST: run AI grading for a submission
    export/grades/           # GET: CSV of scores
    export/feedback/         # GET: CSV of feedback
    pages/signed-url/        # GET: short-lived URL for a page image
  login/page.tsx
  layout.tsx
  globals.css
components/
  ui/                        # shadcn-style primitives
  grading-workspace.tsx      # The core grading UI
  rubric-editor.tsx
  upload-dropzone.tsx
  nav.tsx, theme-*.tsx
lib/
  supabase/                  # server, client, admin, middleware clients
  ocr/                       # OCR abstraction (Claude implementation)
  ai/                        # AI grading abstraction (Claude implementation)
  types.ts, utils.ts, csv.ts
middleware.ts                # auth-gate all app routes
supabase/
  migrations/0001_init.sql   # schema + RLS + storage policies
  seed.sql                   # optional demo assignment
```

## Getting started (local)

### 1. Prerequisites

- Node 18.18+ (or 20+), `npm` or `pnpm`
- A [Supabase](https://supabase.com) project (free tier is fine)
- An [Anthropic](https://console.anthropic.com) API key

### 2. Install

```bash
npm install
```

### 3. Set up Supabase

1. Create a new Supabase project.
2. In the SQL editor, paste the contents of
   `supabase/migrations/0001_init.sql` and run it. That creates every
   table, RLS policy, and the private `exams` storage bucket.
3. (Optional) Sign up once via the app (see step 5) so your user exists
   in `auth.users`, then run `supabase/seed.sql` after replacing
   `<YOUR_USER_ID>` with your user's UUID (`select id, email from auth.users`).
4. In **Authentication → URL Configuration**, add your local and prod
   site URLs (e.g. `http://localhost:3000`,
   `https://YOUR-APP.vercel.app`). Magic links won't redirect correctly
   otherwise.

### 4. Configure environment variables

Copy the template:

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
  Supabase → Project Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY` — same page. Server-only; never expose.
- `ANTHROPIC_API_KEY` — from Anthropic console.
- `ALLOWED_EMAILS` — comma-separated list of emails allowed to sign in.
  For personal use, put only your own email. Anyone else who somehow
  gets a magic link will be rejected at the auth callback.
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` for local, your
  deployed URL for prod.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, sign in with the email on your
allowlist, click the magic link in your inbox, and you're in.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project** → import the repo. Framework preset:
   Next.js. No build overrides needed.
3. Add every variable from `.env.example` under **Environment Variables**
   (both Production and Preview).
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL (e.g.
   `https://exam-analyzer.vercel.app`).
5. In Supabase → Authentication → URL Configuration, add the Vercel URL
   to the allowed redirect list.
6. Deploy.

That's it — Vercel hosts the frontend + server actions + API routes, and
Supabase hosts everything else.

## How grading works

1. You upload pages → they're stored in the private `exams` bucket at
   `{user_id}/{assignment_id}/{submission_id}/page-N.ext`. Only the owner
   can read them (storage RLS enforced by path).
2. `POST /api/ocr` downloads each page server-side and runs Claude Vision
   to transcribe it. The transcription is saved in
   `submission_pages.ocr_text`.
3. `POST /api/grade` concatenates the OCR text and sends it (plus the
   rubric — never the images or student names) to Claude, which returns
   structured JSON per question.
4. Each suggestion is upserted into `graded_answers` with the AI's
   `score_suggested`, `comment_suggested`, `confidence`, and
   `needs_human_review`. **Final** fields (`score_final`, `comment_final`,
   `approved`) stay empty until you approve.
5. In the grading UI you see the image, the OCR, the rubric, and the AI
   suggestion side-by-side. Edit anything, hit `a` to approve, move to
   the next question.
6. Hit **Finalize** to lock in totals and flip the submission to
   `reviewed`.
7. Export CSVs whenever.

## Privacy notes

- All student data lives in your Supabase project. Nothing is shared
  across users; RLS ties every row to `auth.users.id`.
- Exam images are in a private bucket; images are only served to the
  browser via short-lived (10 min) signed URLs created server-side.
- The OCR step sends only the page image to Anthropic — no student name,
  no assignment title, no metadata.
- The grading step sends the transcribed text + your rubric — no names,
  no images. See comments in `lib/ai/claude.ts` and `lib/ocr/claude.ts`.
- `ALLOWED_EMAILS` rejects anyone whose address isn't on the list, even
  if they somehow receive a magic link.

## Keyboard shortcuts (grading)

| Key  | Action |
| ---- | ------ |
| `j`  | Next question |
| `k`  | Previous question |
| `a`  | Approve current + advance |
| `r`  | Reset to AI suggestion |

## Scripts

| Command          | What |
| ---------------- | ---- |
| `npm run dev`    | Start Next dev server |
| `npm run build`  | Production build |
| `npm run start`  | Run the production build |
| `npm run lint`   | ESLint |
| `npm run typecheck` | tsc --noEmit |
