import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { RubricEditor } from "@/components/rubric-editor";

export const dynamic = "force-dynamic";

export default async function RubricPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: assn } = await supabase
    .from("assignments")
    .select("id, title")
    .eq("id", params.id)
    .single();
  if (!assn) notFound();

  const { data: rubric } = await supabase
    .from("rubrics")
    .select("*")
    .eq("assignment_id", assn.id)
    .maybeSingle();

  let rubricId = rubric?.id;
  if (!rubricId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) notFound();
    const { data: created } = await supabase
      .from("rubrics")
      .insert({ assignment_id: assn.id, user_id: user.id })
      .select()
      .single();
    rubricId = created!.id;
  }

  const { data: questions } = await supabase
    .from("rubric_questions")
    .select("*")
    .eq("rubric_id", rubricId)
    .order("position", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/assignments/${assn.id}`}>
            <ArrowLeft className="h-4 w-4" /> {assn.title}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Rubric</h1>
        <p className="text-sm text-muted-foreground">
          Define each question, the max points, and what an ideal answer looks like.
        </p>
      </div>

      <RubricEditor
        assignmentId={assn.id}
        rubricId={rubricId!}
        initialNotes={rubric?.notes ?? ""}
        initialQuestions={(questions ?? []) as any}
      />
    </div>
  );
}
