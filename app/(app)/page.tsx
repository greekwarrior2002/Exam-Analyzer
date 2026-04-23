import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  // Pull assignments plus counts of submissions in each state. We do it in
  // two queries rather than a view so it stays easy to read and to change.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("*")
    .order("updated_at", { ascending: false });

  const ids = (assignments ?? []).map((a) => a.id);
  const { data: subs } = ids.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status")
        .in("assignment_id", ids)
    : { data: [] as { assignment_id: string; status: string }[] };

  const counts = new Map<string, { total: number; graded: number }>();
  for (const s of subs ?? []) {
    const c = counts.get(s.assignment_id) ?? { total: 0, graded: 0 };
    c.total += 1;
    if (s.status === "graded" || s.status === "reviewed" || s.status === "exported") {
      c.graded += 1;
    }
    counts.set(s.assignment_id, c);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">
            Create an assignment, add a rubric, and upload student work.
          </p>
        </div>
        <Button asChild>
          <Link href="/assignments/new">
            <Plus className="h-4 w-4" /> New assignment
          </Link>
        </Button>
      </div>

      {!assignments || assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const c = counts.get(a.id) ?? { total: 0, graded: 0 };
            return (
              <Link key={a.id} href={`/assignments/${a.id}`} className="group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2">{a.title}</CardTitle>
                      {a.status === "archived" && (
                        <Badge variant="secondary">Archived</Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2">
                      {a.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {c.graded}/{c.total} graded · {formatDate(a.updated_at)}
                    </span>
                    <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No assignments yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first assignment to start grading.
          </p>
        </div>
        <Button asChild className="mt-2">
          <Link href="/assignments/new">
            <Plus className="h-4 w-4" /> New assignment
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
