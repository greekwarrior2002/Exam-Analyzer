import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExportPage({
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

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, total_score, max_score, status, students(name, external_id)")
    .eq("assignment_id", assn.id);

  const rowsCount = submissions?.length ?? 0;
  const reviewed = (submissions ?? []).filter(
    (s) => s.status === "reviewed" || s.status === "exported",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/assignments/${assn.id}`}>
            <ArrowLeft className="h-4 w-4" /> {assn.title}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-muted-foreground">
          Download grades and per-student feedback.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grades CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One row per student, one column per question plus totals.
              Uses final scores when approved, AI-suggested otherwise.
            </p>
            <Button asChild>
              <a href={`/api/export/grades?assignment_id=${assn.id}`}>
                <FileDown className="h-4 w-4" /> Download grades.csv
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One row per student with a compiled feedback summary
              across every question.
            </p>
            <Button asChild variant="outline">
              <a href={`/api/export/feedback?assignment_id=${assn.id}`}>
                <FileDown className="h-4 w-4" /> Download feedback.csv
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {rowsCount} submission{rowsCount === 1 ? "" : "s"} · {reviewed} finalized.
      </p>
    </div>
  );
}
