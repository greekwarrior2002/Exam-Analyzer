"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import type { RubricQuestion } from "@/lib/types";

interface Props {
  assignmentId: string;
  rubricId: string;
  initialNotes: string;
  initialQuestions: RubricQuestion[];
}

// Client-side rubric editor. Autosaves per field (debounced). Keeps a stable
// array of questions keyed by id; new ones are inserted once saved.
export function RubricEditor({ rubricId, initialNotes, initialQuestions, assignmentId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [notes, setNotes] = useState(initialNotes);
  const [questions, setQuestions] = useState<RubricQuestion[]>(initialQuestions);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const maxTotal = questions.reduce((s, q) => s + Number(q.max_points || 0), 0);

  function scheduleSave(key: string, fn: () => Promise<void>, ms = 500) {
    clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(async () => {
      setSaving(true);
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    }, ms);
  }

  async function saveNotes(value: string) {
    await supabase.from("rubrics").update({ notes: value }).eq("id", rubricId);
  }

  async function saveQuestion(q: RubricQuestion) {
    const payload = {
      position: q.position,
      question_number: q.question_number,
      prompt: q.prompt,
      max_points: Number(q.max_points) || 0,
      expected_answer: q.expected_answer,
      common_mistakes: q.common_mistakes,
      partial_credit: q.partial_credit,
      notes: q.notes,
    };
    if (q.id.startsWith("tmp-")) {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("not signed in");
      const { data, error } = await supabase
        .from("rubric_questions")
        .insert({ ...payload, rubric_id: rubricId, user_id: user.user.id })
        .select()
        .single();
      if (error) throw error;
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? (data as RubricQuestion) : x)));
    } else {
      const { error } = await supabase
        .from("rubric_questions")
        .update(payload)
        .eq("id", q.id);
      if (error) throw error;
    }
  }

  function updateQ(id: string, patch: Partial<RubricQuestion>) {
    setQuestions((qs) => {
      const next = qs.map((q) => (q.id === id ? { ...q, ...patch } : q));
      const changed = next.find((q) => q.id === id);
      if (changed) scheduleSave(`q:${id}`, () => saveQuestion(changed));
      return next;
    });
  }

  function onNotesChange(v: string) {
    setNotes(v);
    scheduleSave("notes", () => saveNotes(v));
  }

  function addQuestion() {
    const nextPosition = questions.length;
    const nextNumber = (questions.length + 1).toString();
    const tmp: RubricQuestion = {
      id: `tmp-${Date.now()}`,
      rubric_id: rubricId,
      user_id: "",
      position: nextPosition,
      question_number: nextNumber,
      prompt: "",
      max_points: 1,
      expected_answer: "",
      common_mistakes: "",
      partial_credit: "",
      notes: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setQuestions((qs) => [...qs, tmp]);
    scheduleSave(`q:${tmp.id}`, () => saveQuestion(tmp), 150);
  }

  async function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
    if (!id.startsWith("tmp-")) {
      await supabase.from("rubric_questions").delete().eq("id", id);
    }
  }

  // Paste bulk: lines like "1. Define photosynthesis. [3]"
  function onBulkPaste(text: string) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines
      .map((line) => {
        const m = line.match(/^\s*([A-Za-z0-9.]+)[\.)\:]\s*(.*?)\s*(?:\[(\d+(?:\.\d+)?)\]|\((\d+(?:\.\d+)?)\s*(?:pts?|points?)?\))?\s*$/i);
        if (!m) return null;
        const num = m[1];
        const prompt = m[2];
        const pts = Number(m[3] ?? m[4] ?? 1);
        return { num, prompt, pts };
      })
      .filter(Boolean) as { num: string; prompt: string; pts: number }[];

    if (parsed.length === 0) {
      toast.error("Couldn't parse any questions. Use '1. Question text [max_points]'.");
      return;
    }

    startTransition(async () => {
      setSaving(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error("not signed in");
        const base = questions.length;
        const rows = parsed.map((p, i) => ({
          rubric_id: rubricId,
          user_id: user.user!.id,
          position: base + i,
          question_number: p.num,
          prompt: p.prompt,
          max_points: p.pts,
        }));
        const { data, error } = await supabase
          .from("rubric_questions")
          .insert(rows)
          .select();
        if (error) throw error;
        setQuestions((qs) => [...qs, ...((data || []) as RubricQuestion[])]);
        toast.success(`Added ${data?.length ?? 0} questions`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Paste failed");
      } finally {
        setSaving(false);
      }
    });
  }

  useEffect(() => {
    const t = debounceRef.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            {questions.length} question{questions.length === 1 ? "" : "s"} · {maxTotal} pts total
          </Badge>
          <span className="text-xs text-muted-foreground">
            {saving ? "Saving…" : (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <PasteButton onPaste={onBulkPaste} />
          <Button onClick={addQuestion} size="sm">
            <Plus className="h-4 w-4" /> Add question
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label>Rubric notes (shared guidance for all questions)</Label>
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            placeholder="Partial credit encouraged. Minor spelling mistakes are OK."
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <Card key={q.id}>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-[auto_1fr_auto] md:items-start">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Q#</span>
                <Input
                  value={q.question_number}
                  onChange={(e) =>
                    updateQ(q.id, { question_number: e.target.value })
                  }
                  className="w-20"
                />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Prompt</Label>
                  <Textarea
                    value={q.prompt ?? ""}
                    onChange={(e) => updateQ(q.id, { prompt: e.target.value })}
                    rows={2}
                    placeholder="Define photosynthesis."
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Expected answer / key concepts</Label>
                    <Textarea
                      value={q.expected_answer ?? ""}
                      onChange={(e) =>
                        updateQ(q.id, { expected_answer: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Common mistakes</Label>
                    <Textarea
                      value={q.common_mistakes ?? ""}
                      onChange={(e) =>
                        updateQ(q.id, { common_mistakes: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Partial credit rules</Label>
                    <Textarea
                      value={q.partial_credit ?? ""}
                      onChange={(e) =>
                        updateQ(q.id, { partial_credit: e.target.value })
                      }
                      rows={2}
                      placeholder="1 pt per concept; −1 if no units."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Notes (private)</Label>
                    <Textarea
                      value={q.notes ?? ""}
                      onChange={(e) => updateQ(q.id, { notes: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Max pts</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={q.max_points}
                    onChange={(e) =>
                      updateQ(q.id, { max_points: Number(e.target.value) })
                    }
                    className="w-24"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQuestion(q.id)}
                  aria-label="Remove question"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {questions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
            No questions yet. Add one, or paste a list.
            <div className="flex gap-2">
              <PasteButton onPaste={onBulkPaste} />
              <Button onClick={addQuestion} size="sm">
                <Plus className="h-4 w-4" /> Add question
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => router.push(`/assignments/${assignmentId}`)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

function PasteButton({ onPaste }: { onPaste: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-4 w-4" /> Paste list
      </Button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-xl">
        <CardContent className="space-y-3 pt-6">
          <Label>Paste questions</Label>
          <p className="text-xs text-muted-foreground">
            One per line. Format: <code>1. Question text [3]</code> — number, prompt, max points.
          </p>
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1. Define photosynthesis. [3]\n2. Name two stages. [2]"}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onPaste(text);
                setOpen(false);
                setText("");
              }}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
