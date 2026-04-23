"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles,
  Wand2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FlagTriangleRight,
  RotateCcw,
  FileImage,
  ArrowRight,
} from "lucide-react";
import { cn, formatPercent, clamp } from "@/lib/utils";
import type {
  GradedAnswer,
  RubricQuestion,
  SubmissionPage,
  SubmissionStatus,
} from "@/lib/types";

interface Props {
  assignmentId: string;
  submissionId: string;
  submissionStatus: SubmissionStatus;
  questions: RubricQuestion[];
  pages: SubmissionPage[];
  initialAnswers: GradedAnswer[];
}

export function GradingWorkspace({
  assignmentId,
  submissionId,
  submissionStatus,
  questions,
  pages,
  initialAnswers,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [answers, setAnswers] = useState<GradedAnswer[]>(initialAnswers);
  const [pageUrls, setPageUrls] = useState<Record<string, string>>({});
  const [activeQ, setActiveQ] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [grading, setGrading] = useState(false);
  const [rerunningOcr, setRerunningOcr] = useState(false);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load short-lived signed URLs for images. Refreshes every ~9 min.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        pages.map(async (p) => {
          const r = await fetch(
            `/api/pages/signed-url?path=${encodeURIComponent(p.storage_path)}`,
          );
          const j = await r.json();
          return [p.id, j.url as string] as const;
        }),
      );
      if (!cancelled) setPageUrls(Object.fromEntries(entries));
    }
    if (pages.length) load();
    const i = setInterval(load, 9 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [pages]);

  const visibleQuestions = useMemo(() => {
    if (!onlyLowConfidence) return questions;
    return questions.filter((q) => {
      const a = answers.find((x) => x.rubric_question_id === q.id);
      return !a || a.needs_human_review || (a.confidence ?? 0) < 0.7;
    });
  }, [questions, answers, onlyLowConfidence]);

  const currentQuestion = visibleQuestions[activeQ] ?? questions[0];
  const currentAnswer = answers.find(
    (a) => a.rubric_question_id === currentQuestion?.id,
  );

  const totalFinal = answers.reduce(
    (s, a) => s + (a.approved && a.score_final != null ? Number(a.score_final) : 0),
    0,
  );
  const totalMax = questions.reduce((s, q) => s + Number(q.max_points), 0);
  const approvedCount = answers.filter((a) => a.approved).length;

  // Keyboard shortcuts: j/k next/prev, a approve, r reset to AI, o toggle OCR.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable)
          return;
      }
      if (e.key === "j") {
        setActiveQ((i) => Math.min(i + 1, Math.max(visibleQuestions.length - 1, 0)));
      } else if (e.key === "k") {
        setActiveQ((i) => Math.max(i - 1, 0));
      } else if (e.key === "a" && currentQuestion) {
        approve(currentQuestion.id);
      } else if (e.key === "r" && currentQuestion) {
        resetToSuggested(currentQuestion.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function updateAnswer(qId: string, patch: Partial<GradedAnswer>) {
    setAnswers((arr) => {
      const existing = arr.find((a) => a.rubric_question_id === qId);
      if (!existing) return arr;
      const next = { ...existing, ...patch };
      const other = arr.filter((a) => a.rubric_question_id !== qId);
      const updated = [...other, next];
      scheduleSave(next);
      return updated;
    });
  }

  function scheduleSave(a: GradedAnswer) {
    clearTimeout(saveTimers.current[a.id]);
    saveTimers.current[a.id] = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("graded_answers")
        .update({
          score_final: a.score_final,
          comment_final: a.comment_final,
          approved: a.approved,
          approved_at: a.approved_at,
        })
        .eq("id", a.id);
      setSaving(false);
      if (error) toast.error(error.message);
    }, 500);
  }

  function resetToSuggested(qId: string) {
    const a = answers.find((x) => x.rubric_question_id === qId);
    if (!a) return;
    updateAnswer(qId, {
      score_final: a.score_suggested,
      comment_final: a.comment_suggested,
      approved: false,
      approved_at: null,
    });
  }

  function approve(qId: string) {
    const a = answers.find((x) => x.rubric_question_id === qId);
    const q = questions.find((x) => x.id === qId);
    if (!a || !q) return;
    const score =
      a.score_final != null ? a.score_final : a.score_suggested ?? 0;
    const comment =
      a.comment_final != null ? a.comment_final : a.comment_suggested ?? "";
    updateAnswer(qId, {
      score_final: clamp(Number(score), 0, Number(q.max_points)),
      comment_final: comment,
      approved: true,
      approved_at: new Date().toISOString(),
    });
    // Advance to next question for keyboard flow.
    setActiveQ((i) => Math.min(i + 1, Math.max(visibleQuestions.length - 1, 0)));
  }

  async function runGrading() {
    setGrading(true);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      toast.success("AI grading complete");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setGrading(false);
    }
  }

  async function rerunOcr() {
    setRerunningOcr(true);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("OCR complete");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setRerunningOcr(false);
    }
  }

  async function finalizeSubmission() {
    const total = answers.reduce(
      (s, a) => s + (a.approved && a.score_final != null ? Number(a.score_final) : 0),
      0,
    );
    const max = questions.reduce((s, q) => s + Number(q.max_points), 0);
    const { error } = await supabase
      .from("submissions")
      .update({
        status: "reviewed",
        total_score: total,
        max_score: max,
      })
      .eq("id", submissionId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Submission finalized");
    router.push(`/assignments/${assignmentId}`);
  }

  const ocrComplete = pages.every((p) => p.ocr_status === "done");
  const hasAnswers = answers.length > 0;
  const allApproved = questions.length > 0 && approvedCount === questions.length;

  return (
    <div className="space-y-4">
      <Toolbar
        status={submissionStatus}
        ocrComplete={ocrComplete}
        hasAnswers={hasAnswers}
        grading={grading}
        rerunningOcr={rerunningOcr}
        approvedCount={approvedCount}
        totalQuestions={questions.length}
        totalFinal={totalFinal}
        totalMax={totalMax}
        saving={saving}
        onlyLowConfidence={onlyLowConfidence}
        onToggleLowConfidence={() => setOnlyLowConfidence((v) => !v)}
        onRunGrading={runGrading}
        onRerunOcr={rerunOcr}
        onFinalize={finalizeSubmission}
        canFinalize={allApproved}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left: student pages */}
        <Card className="overflow-hidden">
          <CardContent className="flex h-[calc(100vh-240px)] min-h-[480px] flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  Page {pages.length ? activePage + 1 : 0} / {pages.length}
                </Badge>
                {pages[activePage] && (
                  <Badge
                    variant={
                      pages[activePage].ocr_status === "done"
                        ? "success"
                        : pages[activePage].ocr_status === "error"
                          ? "danger"
                          : "secondary"
                    }
                  >
                    OCR: {pages[activePage].ocr_status}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={activePage === 0}
                  onClick={() => setActivePage((i) => Math.max(i - 1, 0))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={activePage >= pages.length - 1}
                  onClick={() =>
                    setActivePage((i) => Math.min(i + 1, pages.length - 1))
                  }
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-md border bg-muted/30">
              {pages[activePage] ? (
                pageUrls[pages[activePage].id] ? (
                  // Using <img> intentionally: signed URLs are short-lived
                  // and dynamic, which doesn't fit next/image's optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pageUrls[pages[activePage].id]}
                    alt={`Page ${activePage + 1}`}
                    className="mx-auto block max-w-full"
                  />
                ) : (
                  <Skeleton className="h-full w-full" />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <FileImage className="mr-2 h-4 w-4" /> No pages uploaded
                </div>
              )}
            </div>

            {pages[activePage]?.ocr_text && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Show OCR text
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
                  {pages[activePage].ocr_text}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>

        {/* Right: current question */}
        <div className="space-y-3">
          <QuestionNav
            questions={visibleQuestions}
            answers={answers}
            activeIndex={activeQ}
            onSelect={setActiveQ}
          />

          {currentQuestion ? (
            <QuestionPanel
              question={currentQuestion}
              answer={currentAnswer}
              onChange={(patch) => updateAnswer(currentQuestion.id, patch)}
              onApprove={() => approve(currentQuestion.id)}
              onReset={() => resetToSuggested(currentQuestion.id)}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                No questions to show.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Sub-components ----------------

function Toolbar(props: {
  status: SubmissionStatus;
  ocrComplete: boolean;
  hasAnswers: boolean;
  grading: boolean;
  rerunningOcr: boolean;
  approvedCount: number;
  totalQuestions: number;
  totalFinal: number;
  totalMax: number;
  saving: boolean;
  onlyLowConfidence: boolean;
  onToggleLowConfidence: () => void;
  onRunGrading: () => void;
  onRerunOcr: () => void;
  onFinalize: () => void;
  canFinalize: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">
            {props.approvedCount}/{props.totalQuestions} approved
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            Score: {props.totalFinal}/{props.totalMax}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {props.saving ? "Saving…" : "All changes saved"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
              props.onlyLowConfidence ? "bg-amber-100 dark:bg-amber-950" : "",
            )}
            onClick={props.onToggleLowConfidence}
          >
            <FlagTriangleRight className="h-3 w-3" />
            {props.onlyLowConfidence ? "Showing flagged" : "Show only flagged"}
          </button>
          <Button
            size="sm"
            variant="outline"
            disabled={props.rerunningOcr}
            onClick={props.onRerunOcr}
          >
            <Wand2 className="h-4 w-4" />
            {props.rerunningOcr ? "OCR…" : "Re-run OCR"}
          </Button>
          <Button
            size="sm"
            disabled={props.grading || !props.ocrComplete}
            onClick={props.onRunGrading}
          >
            <Sparkles className="h-4 w-4" />
            {props.grading ? "Grading…" : props.hasAnswers ? "Re-grade with AI" : "Grade with AI"}
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={!props.canFinalize}
            onClick={props.onFinalize}
          >
            <CheckCircle2 className="h-4 w-4" /> Finalize
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QuestionNav({
  questions,
  answers,
  activeIndex,
  onSelect,
}: {
  questions: RubricQuestion[];
  answers: GradedAnswer[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {questions.map((q, i) => {
        const a = answers.find((x) => x.rubric_question_id === q.id);
        const flagged = a?.needs_human_review || (a?.confidence != null && a.confidence < 0.7);
        return (
          <button
            key={q.id}
            onClick={() => onSelect(i)}
            className={cn(
              "relative inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
              i === activeIndex
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent",
              a?.approved && i !== activeIndex && "border-emerald-400/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
            )}
            aria-label={`Question ${q.question_number}`}
          >
            {q.question_number}
            {flagged && !a?.approved && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function QuestionPanel({
  question,
  answer,
  onChange,
  onApprove,
  onReset,
}: {
  question: RubricQuestion;
  answer: GradedAnswer | undefined;
  onChange: (patch: Partial<GradedAnswer>) => void;
  onApprove: () => void;
  onReset: () => void;
}) {
  const maxPts = Number(question.max_points);
  const score = answer?.score_final ?? answer?.score_suggested ?? "";
  const comment = answer?.comment_final ?? answer?.comment_suggested ?? "";

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Question</span>
            <span className="text-sm font-semibold">{question.question_number}</span>
            <Badge variant="secondary" className="tabular-nums">
              {maxPts} pts
            </Badge>
            {answer?.confidence != null && (
              <ConfidencePill confidence={answer.confidence} />
            )}
            {answer?.needs_human_review && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Review
              </Badge>
            )}
            {answer?.approved && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Approved
              </Badge>
            )}
          </div>
          {question.prompt && (
            <p className="mt-2 text-sm">{question.prompt}</p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3 text-xs">
            <div className="mb-1 font-medium">Expected answer</div>
            <div className="whitespace-pre-wrap text-muted-foreground">
              {question.expected_answer || "—"}
            </div>
            {question.partial_credit && (
              <>
                <Separator className="my-2" />
                <div className="mb-1 font-medium">Partial credit</div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {question.partial_credit}
                </div>
              </>
            )}
          </div>
          <div className="rounded-md border p-3 text-xs">
            <div className="mb-1 font-medium">Extracted student answer (OCR)</div>
            <div className="max-h-40 overflow-auto whitespace-pre-wrap text-muted-foreground">
              {answer?.extracted_answer || <span className="italic">Not yet extracted — run AI grading.</span>}
            </div>
          </div>
        </div>

        {(answer?.matched_criteria?.length || answer?.missing_criteria?.length) && (
          <div className="grid gap-3 md:grid-cols-2">
            {answer.matched_criteria.length > 0 && (
              <div className="text-xs">
                <div className="mb-1 font-medium">Matched criteria</div>
                <ul className="space-y-1">
                  {answer.matched_criteria.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {answer.missing_criteria.length > 0 && (
              <div className="text-xs">
                <div className="mb-1 font-medium">Missing criteria</div>
                <ul className="space-y-1">
                  {answer.missing_criteria.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {answer?.justification && (
          <div className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI reasoning: </span>
            {answer.justification}
          </div>
        )}

        <Separator />

        <div className="grid gap-3 md:grid-cols-[auto_1fr]">
          <div className="space-y-1">
            <Label>Score</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0"
                max={maxPts}
                value={score}
                disabled={!answer}
                onChange={(e) =>
                  onChange({
                    score_final: e.target.value === "" ? null : Number(e.target.value),
                    approved: false,
                  })
                }
                className="w-24 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">/ {maxPts}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Feedback comment</Label>
            <Textarea
              rows={3}
              value={comment}
              disabled={!answer}
              onChange={(e) =>
                onChange({ comment_final: e.target.value, approved: false })
              }
              placeholder="Good understanding, but missing key definition of X."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Shortcuts: <kbd className="rounded border px-1">j</kbd>/<kbd className="rounded border px-1">k</kbd> navigate
            · <kbd className="rounded border px-1">a</kbd> approve
            · <kbd className="rounded border px-1">r</kbd> reset to AI
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!answer}
            >
              <RotateCcw className="h-4 w-4" /> Reset to AI
            </Button>
            <Button size="sm" onClick={onApprove} disabled={!answer}>
              <CheckCircle2 className="h-4 w-4" />
              {answer?.approved ? "Re-approve & next" : "Approve & next"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const variant: "success" | "warning" | "danger" =
    confidence >= 0.8 ? "success" : confidence >= 0.6 ? "warning" : "danger";
  return (
    <Badge variant={variant} className="tabular-nums">
      {formatPercent(confidence)} conf
    </Badge>
  );
}
