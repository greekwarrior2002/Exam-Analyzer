import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface StatRow {
  qnum: string;
  prompt: string | null;
  max: number;
  avg: number | null;
  low: number | null;
  high: number | null;
  flagged: number;
  count: number;
}

export default async function AnalyticsPage({
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

  const { data: questions } = await supabase
    .from("rubric_questions")
    .select("id, question_number, prompt, max_points, position")
    .eq("rubric_id", rubric?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("position", { ascending: true });

  // All graded answers for this assignment's submissions.
  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, total_score, max_score, status")
    .eq("assignment_id", assn.id);

  const submissionIds = (submissions ?? []).map((s) => s.id);
  const { data: answers } = submissionIds.length
    ? await supabase
        .from("graded_answers")
        .select("rubric_question_id, score_final, score_suggested, needs_human_review, approved")
        .in("submission_id", submissionIds)
    : { data: [] as any[] };

  const rows: StatRow[] = (questions ?? []).map((q) => {
    const related = (answers ?? []).filter(
      (a) => a.rubric_question_id === q.id,
    );
    const scores = related
      .map((a) => (a.approved ? a.score_final : a.score_suggested))
      .filter((s): s is number => s != null)
      .map(Number);
    const avg = scores.length
      ? scores.reduce((s, n) => s + n, 0) / scores.length
      : null;
    return {
      qnum: q.question_number,
      prompt: q.prompt,
      max: Number(q.max_points),
      avg,
      low: scores.length ? Math.min(...scores) : null,
      high: scores.length ? Math.max(...scores) : null,
      flagged: related.filter((a) => a.needs_human_review).length,
      count: related.length,
    };
  });

  const submissionsCount = submissions?.length ?? 0;
  const graded = (submissions ?? []).filter(
    (s) => s.status === "reviewed" || s.status === "exported",
  );
  const classAvg = graded.length
    ? graded.reduce((s, x) => s + Number(x.total_score ?? 0), 0) / graded.length
    : null;
  const classMax = graded.length ? Number(graded[0].max_score ?? 0) : null;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/assignments/${assn.id}`}>
            <ArrowLeft className="h-4 w-4" /> {assn.title}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Per-question performance across reviewed submissions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Submissions" value={submissionsCount} />
        <StatCard label="Finalized" value={graded.length} />
        <StatCard
          label="Class average"
          value={
            classAvg != null && classMax != null
              ? `${classAvg.toFixed(1)} / ${classMax}`
              : "—"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per question</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Q#</th>
                <th className="px-4 py-2">Prompt</th>
                <th className="px-4 py-2 text-right">Avg</th>
                <th className="px-4 py-2 text-right">Low</th>
                <th className="px-4 py-2 text-right">High</th>
                <th className="px-4 py-2 text-right">Flagged</th>
                <th className="px-4 py-2 text-right">Responses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.qnum} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{r.qnum}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <div className="max-w-md truncate">{r.prompt || "—"}</div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.avg != null ? `${r.avg.toFixed(1)} / ${r.max}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.low != null ? r.low : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.high != null ? r.high : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.flagged}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
