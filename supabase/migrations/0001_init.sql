-- =====================================================================
-- Exam Analyzer: initial schema
-- Single-user personal app. RLS keeps data private to the owning user.
-- =====================================================================

-- Extensions -----------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Helper: updated_at touch ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Assignments ----------------------------------------------------------
create table if not exists public.assignments (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  total_points numeric(6,2),
  status       text not null default 'active' check (status in ('active','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists assignments_user_idx on public.assignments(user_id);
drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch before update on public.assignments
  for each row execute procedure public.touch_updated_at();

-- Rubrics --------------------------------------------------------------
-- 1:1 with assignment. Kept separate so we can iterate on rubric versions later.
create table if not exists public.rubrics (
  id            uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null unique references public.assignments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists rubrics_touch on public.rubrics;
create trigger rubrics_touch before update on public.rubrics
  for each row execute procedure public.touch_updated_at();

-- Rubric questions -----------------------------------------------------
create table if not exists public.rubric_questions (
  id                uuid primary key default uuid_generate_v4(),
  rubric_id         uuid not null references public.rubrics(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  position          int  not null default 0,
  question_number   text not null,           -- "1", "2a", "Q3", etc.
  prompt            text,                    -- the question text
  max_points        numeric(6,2) not null default 1,
  expected_answer   text,                    -- key concepts / ideal answer
  common_mistakes   text,
  partial_credit    text,                    -- plaintext rules: "−1 if no units", etc.
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists rubric_questions_rubric_idx on public.rubric_questions(rubric_id, position);
drop trigger if exists rubric_questions_touch on public.rubric_questions;
create trigger rubric_questions_touch before update on public.rubric_questions
  for each row execute procedure public.touch_updated_at();

-- Students -------------------------------------------------------------
-- Intentionally minimal: a name (or anonymous ID) is enough for personal use.
create table if not exists public.students (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  external_id text,                           -- e.g. student number, optional
  created_at timestamptz not null default now()
);
create index if not exists students_user_idx on public.students(user_id);

-- Submissions ----------------------------------------------------------
create table if not exists public.submissions (
  id            uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid references public.students(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'uploaded'
                check (status in ('uploaded','ocr_done','graded','reviewed','exported')),
  total_score   numeric(8,2),
  max_score     numeric(8,2),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists submissions_assignment_idx on public.submissions(assignment_id);
create index if not exists submissions_student_idx on public.submissions(student_id);
drop trigger if exists submissions_touch on public.submissions;
create trigger submissions_touch before update on public.submissions
  for each row execute procedure public.touch_updated_at();

-- Submission pages (one per image) -------------------------------------
create table if not exists public.submission_pages (
  id             uuid primary key default uuid_generate_v4(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  page_number    int not null default 1,
  storage_path   text not null,              -- path within the 'exams' bucket
  mime_type      text,
  ocr_text       text,                       -- raw extracted text
  ocr_status     text not null default 'pending'
                 check (ocr_status in ('pending','processing','done','error')),
  ocr_error      text,
  created_at     timestamptz not null default now()
);
create index if not exists submission_pages_sub_idx
  on public.submission_pages(submission_id, page_number);

-- Graded answers -------------------------------------------------------
-- One row per (submission, rubric_question). Stores both AI suggestion and final.
create table if not exists public.graded_answers (
  id                 uuid primary key default uuid_generate_v4(),
  submission_id      uuid not null references public.submissions(id) on delete cascade,
  rubric_question_id uuid not null references public.rubric_questions(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- OCR / extraction
  extracted_answer   text,

  -- AI suggestion (immutable once written; UI uses it as a starting point)
  score_suggested    numeric(6,2),
  justification      text,
  comment_suggested  text,
  confidence         numeric(3,2),            -- 0..1
  needs_human_review boolean not null default false,
  matched_criteria   jsonb not null default '[]'::jsonb,
  missing_criteria   jsonb not null default '[]'::jsonb,

  -- Human-approved final (what actually counts)
  score_final        numeric(6,2),
  comment_final      text,
  approved           boolean not null default false,
  approved_at        timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique(submission_id, rubric_question_id)
);
create index if not exists graded_answers_sub_idx on public.graded_answers(submission_id);
drop trigger if exists graded_answers_touch on public.graded_answers;
create trigger graded_answers_touch before update on public.graded_answers
  for each row execute procedure public.touch_updated_at();

-- Reusable rubric templates -------------------------------------------
create table if not exists public.rubric_templates (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,                 -- snapshot of questions
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- Every row is owned by exactly one auth user. Owners can do everything.
-- =====================================================================
alter table public.assignments       enable row level security;
alter table public.rubrics           enable row level security;
alter table public.rubric_questions  enable row level security;
alter table public.students          enable row level security;
alter table public.submissions       enable row level security;
alter table public.submission_pages  enable row level security;
alter table public.graded_answers    enable row level security;
alter table public.rubric_templates  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'assignments','rubrics','rubric_questions','students',
    'submissions','submission_pages','graded_answers','rubric_templates'
  ]
  loop
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    execute format(
      'create policy %I_owner on public.%I for all
         using (user_id = auth.uid())
         with check (user_id = auth.uid())',
      t, t
    );
  end loop;
end $$;

-- =====================================================================
-- Storage: private bucket for exam images.
-- Object path convention: {user_id}/{assignment_id}/{submission_id}/{page}.ext
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('exams', 'exams', false)
on conflict (id) do nothing;

-- Owner-only access to exam files. First path segment must match auth.uid().
drop policy if exists "exams owner read"   on storage.objects;
drop policy if exists "exams owner write"  on storage.objects;
drop policy if exists "exams owner update" on storage.objects;
drop policy if exists "exams owner delete" on storage.objects;

create policy "exams owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exams owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exams' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exams owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exams owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = auth.uid()::text);
