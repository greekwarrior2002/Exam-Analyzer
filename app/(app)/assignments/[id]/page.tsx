import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  ClipboardList,
  BarChart3,
  FileDown,
  ArrowLeft,
  FileText,
  ArrowRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: assn } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!assn) notFound();

  const { data: rubric } = await supabase
    .from("rubrics")
    .select("id")
    .eq("assignment_id", assn.id)
    .maybeSingle();

  const [{ count: qCount }, { data: submissions }] = await Promise.all([
    supabase
      .from("rubric_questions")
      .select("*", { count: "exact", head: true })
      .eq("rubric_id", rubric?.id ?? "00000000-0000-0000-0000-000000000000"),
    supabase
      .from("submissions")
      .select("id, status, total_score, max_score, created_at, students(name, external_id)")
      .eq("assignment_id", assn.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Assignments
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{assn.title}</h1>
            {assn.description && (
              <p className="mt-1 text-sm text-muted-foreground">{assn.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/assignments/${assn.id}/rubric`}>
                <ClipboardList className="h-4 w-4" /> Rubric
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/assignments/${assn.id}/upload`}>
                <Upload className="h-4 w-4" /> Upload
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Rubric questions" value={qCount ?? 0} />
        <StatCard label="Submissions" value={submissions?.length ?? 0} />
        <StatCard
          label="Total points"
          value={assn.total_points ? Number(assn.total_points) : "—"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/assignments/${assn.id}/analytics`}>
            <BarChart3 className="h-4 w-4" /> Analytics
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/assignments/${assn.id}/export`}>
            <FileDown className="h-4 w-4" /> Export
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {!submissions || submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p>No submissions yet.</p>
              <Button asChild size="sm">
                <Link href={`/assignments/${assn.id}/upload`}>
                  <Upload className="h-4 w-4" /> Upload first submission
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {submissions.map((s: any) => (
                <li key={s.id}>
                  <Link
                    href={`/assignments/${assn.id}/grade/${s.id}`}
                    className="group flex items-center justify-between gap-4 px-2 py-3 transition-colors hover:bg-accent/50 rounded-md"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.students?.name || "Unnamed student"}
                        {s.students?.external_id && (
                          <span className="ml-2 text-muted-foreground">
                            {s.students.external_id}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Uploaded {formatDate(s.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={s.status} />
                      <div className="w-20 text-right text-sm tabular-nums">
                        {s.total_score != null
                          ? `${Number(s.total_score)}/${Number(s.max_score ?? 0)}`
                          : "—"}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "default" }> = {
    uploaded: { label: "Uploaded", variant: "secondary" },
    ocr_done: { label: "OCR done", variant: "secondary" },
    graded: { label: "AI graded", variant: "warning" },
    reviewed: { label: "Reviewed", variant: "success" },
    exported: { label: "Exported", variant: "success" },
  };
  const v = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}
