import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";

export const dynamic = "force-dynamic";

export default async function UploadPage({
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
    .select("id")
    .eq("assignment_id", assn.id)
    .maybeSingle();

  const { count: qCount } = await supabase
    .from("rubric_questions")
    .select("*", { count: "exact", head: true })
    .eq("rubric_id", rubric?.id ?? "00000000-0000-0000-0000-000000000000");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/assignments/${assn.id}`}>
            <ArrowLeft className="h-4 w-4" /> {assn.title}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Upload submissions</h1>
        <p className="text-sm text-muted-foreground">
          Drop one or more exam images per student. Name the student, then add pages.
        </p>
      </div>

      {(!qCount || qCount === 0) && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You don't have any rubric questions yet.{" "}
          <Link
            href={`/assignments/${assn.id}/rubric`}
            className="font-medium underline underline-offset-4"
          >
            Add a rubric
          </Link>{" "}
          before uploading so AI grading has something to compare against.
        </div>
      )}

      <UploadDropzone assignmentId={assn.id} />
    </div>
  );
}
