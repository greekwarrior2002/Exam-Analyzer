import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

async function createAssignment(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const totalPointsRaw = String(formData.get("total_points") || "").trim();
  const total_points = totalPointsRaw ? Number(totalPointsRaw) : null;

  if (!title) redirect("/assignments/new");

  const { data: assn, error } = await supabase
    .from("assignments")
    .insert({ user_id: user.id, title, description, total_points })
    .select()
    .single();
  if (error || !assn) throw error;

  // Create an empty rubric up front so editing has a stable id.
  await supabase.from("rubrics").insert({
    assignment_id: assn.id,
    user_id: user.id,
  });

  redirect(`/assignments/${assn.id}/rubric`);
}

export default function NewAssignmentPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New assignment</CardTitle>
          <CardDescription>
            Give it a name. You'll add the rubric in the next step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAssignment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Biology 101 — Midterm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Unit 3 chapters, closed-book."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_points">Total points (optional)</Label>
              <Input
                id="total_points"
                name="total_points"
                type="number"
                step="0.5"
                min="0"
                placeholder="100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button asChild variant="ghost">
                <Link href="/">Cancel</Link>
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
