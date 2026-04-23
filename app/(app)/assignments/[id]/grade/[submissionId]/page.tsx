import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { GradingWorkspace } from "@/components/grading-workspace";
import type { GradedAnswer, RubricQuestion, SubmissionPage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GradePage({
  params,
}: {
  params: { id: string; submissionId: string };
}) {
  const supabase = createClient();

  const { data: assn } = await supabase
    .from("assignments")
    .select("id, title")
    .eq("id", params.id)
    .single();
  if (!assn) notFound();

  const { data: submission } = await supabase
    .from("submissions")
    .select("*, students(name, external_id)")
    .eq("id", params.submissionId)
    .single();
  if (!submission) notFound();

  const { data: rubric } = await supabase
    .from("rubrics")
    .select("id, notes")
    .eq("assignment_id", assn.id)
    .maybeSingle();

  const [{ data: questions }, { data: pages }, { data: answers }] = await Promise.all([
    supabase
      .from("rubric_questions")
      .select("*")
      .eq("rubric_id", rubric?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("position", { ascending: true }),
    supabase
      .from("submission_pages")
      .select("*")
      .eq("submission_id", params.submissionId)
      .order("page_number", { ascending: true }),
    supabase
      .from("graded_answers")
      .select("*")
      .eq("submission_id", params.submissionId),
  ]);

  const studentLabel =
    submission.students?.name ||
    (submission.students?.external_id ? submission.students.external_id : "Unnamed");

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/assignments/${assn.id}`}>
            <ArrowLeft className="h-4 w-4" /> {assn.title}
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          Grading · {studentLabel}
        </h1>
      </div>

      <GradingWorkspace
        assignmentId={assn.id}
        submissionId={submission.id}
        submissionStatus={submission.status}
        questions={(questions ?? []) as RubricQuestion[]}
        pages={(pages ?? []) as SubmissionPage[]}
        initialAnswers={(answers ?? []) as GradedAnswer[]}
      />
    </div>
  );
}
