import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gradeSubmission } from "@/lib/ai";
import type { RubricQuestion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  submission_id: z.string().uuid(),
});

/**
 * Runs AI grading for a submission. Requires that OCR has already completed.
 * Upserts one graded_answers row per rubric question, leaving final scores
 * unset — the teacher approves manually in the UI.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { submission_id } = parsed.data;

  const { data: submission, error: subErr } = await supabase
    .from("submissions")
    .select("id, assignment_id")
    .eq("id", submission_id)
    .single();
  if (subErr || !submission) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Concatenate OCR text in page order.
  const { data: pages } = await supabase
    .from("submission_pages")
    .select("page_number, ocr_text, ocr_status")
    .eq("submission_id", submission_id)
    .order("page_number", { ascending: true });

  const anyPending = (pages ?? []).some((p) => p.ocr_status !== "done");
  if (anyPending) {
    return NextResponse.json(
      { error: "OCR not complete for all pages" },
      { status: 409 },
    );
  }

  const studentText = (pages ?? [])
    .map((p) => `--- Page ${p.page_number} ---\n${p.ocr_text ?? ""}`)
    .join("\n\n");

  // Load rubric + questions for this assignment.
  const { data: rubric } = await supabase
    .from("rubrics")
    .select("id, notes")
    .eq("assignment_id", submission.assignment_id)
    .single();

  if (!rubric) {
    return NextResponse.json(
      { error: "rubric not found for assignment" },
      { status: 400 },
    );
  }

  const { data: questions } = await supabase
    .from("rubric_questions")
    .select("*")
    .eq("rubric_id", rubric.id)
    .order("position", { ascending: true });

  if (!questions || questions.length === 0) {
    return NextResponse.json(
      { error: "rubric has no questions" },
      { status: 400 },
    );
  }

  const { results } = await gradeSubmission({
    rubricNotes: rubric.notes,
    questions: questions as RubricQuestion[],
    studentText,
  });

  // Upsert one graded_answers row per question. We deliberately do NOT
  // populate score_final/comment_final or set approved=true — those belong
  // to the teacher.
  const rows = results.map((r) => ({
    submission_id,
    rubric_question_id: r.question_id,
    user_id: user.id,
    extracted_answer: r.extracted_answer,
    score_suggested: r.score_suggested,
    justification: r.justification,
    comment_suggested: r.comment,
    confidence: r.confidence,
    needs_human_review: r.needs_human_review,
    matched_criteria: r.matched_criteria,
    missing_criteria: r.missing_criteria,
  }));

  const { error: upsertErr } = await supabase
    .from("graded_answers")
    .upsert(rows, { onConflict: "submission_id,rubric_question_id" });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  await supabase
    .from("submissions")
    .update({ status: "graded" })
    .eq("id", submission_id);

  return NextResponse.json({ ok: true, count: rows.length });
}
