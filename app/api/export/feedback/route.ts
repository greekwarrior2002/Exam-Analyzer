import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const assignmentId = url.searchParams.get("assignment_id");
  if (!assignmentId) {
    return NextResponse.json({ error: "missing assignment_id" }, { status: 400 });
  }

  const { data: assn } = await supabase
    .from("assignments")
    .select("id, title")
    .eq("id", assignmentId)
    .single();
  if (!assn) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: rubric } = await supabase
    .from("rubrics")
    .select("id")
    .eq("assignment_id", assn.id)
    .maybeSingle();

  const { data: questions } = await supabase
    .from("rubric_questions")
    .select("id, question_number, max_points, position")
    .eq("rubric_id", rubric?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("position", { ascending: true });

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, total_score, max_score, students(name, external_id)")
    .eq("assignment_id", assn.id)
    .order("created_at", { ascending: true });

  const subIds = (submissions ?? []).map((s) => s.id);
  const { data: answers } = subIds.length
    ? await supabase
        .from("graded_answers")
        .select(
          "submission_id, rubric_question_id, score_final, score_suggested, comment_final, comment_suggested, approved",
        )
        .in("submission_id", subIds)
    : { data: [] as any[] };

  const headers = ["Student", "External ID", "Total", "Max", "Feedback"];

  const rows = (submissions ?? []).map((s: any) => {
    const blocks = (questions ?? []).map((q) => {
      const a = (answers ?? []).find(
        (x: any) => x.submission_id === s.id && x.rubric_question_id === q.id,
      );
      if (!a) return `Q${q.question_number}: (not graded)`;
      const score = a.approved
        ? a.score_final
        : (a.score_final ?? a.score_suggested);
      const comment = a.comment_final || a.comment_suggested || "";
      return `Q${q.question_number} — ${
        score != null ? Number(score) : "—"
      }/${Number(q.max_points)}${comment ? ` · ${comment}` : ""}`;
    });
    return [
      s.students?.name ?? "",
      s.students?.external_id ?? "",
      s.total_score != null ? Number(s.total_score) : "",
      s.max_score != null ? Number(s.max_score) : "",
      blocks.join("\n"),
    ];
  });

  const csv = toCsv(headers, rows);
  const filename = `${slug(assn.title)}-feedback.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
