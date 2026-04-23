import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { clamp } from "@/lib/utils";
import type { AIGradeResult } from "@/lib/types";
import type { GradeInput, GradeOutput } from "./index";

// Privacy: we send only rubric + extracted text. No student names, no image
// bytes, no IDs. The model gets just enough to reason about answers.
const SYSTEM_PROMPT = `You are a careful grading assistant helping a teacher evaluate student exam answers.

You DO NOT make final grading decisions. You produce suggestions only — a human reviews and approves.

For each rubric question:
- Locate the student's answer in the transcribed text (it may be messy; do your best).
- Compare it to the expected answer and partial-credit rules.
- Suggest a score between 0 and the question's max_points. Fractional points are fine if the rubric allows.
- Write a short, professional, constructive comment (one or two sentences).
- Write a one-sentence justification that cites what the student did or missed.
- List which rubric criteria the student clearly met and which they missed.
- Set confidence in [0, 1]. Be HONEST — low confidence is better than a confident wrong answer.
- Set needs_human_review = true whenever ANY of:
    * confidence < 0.7
    * OCR text for this question is missing or illegible
    * the answer is borderline, ambiguous, or creative in a way the rubric doesn't cover
    * partial credit is being applied

Comment style: short, clear, constructive, professional.
Good: "Correct approach, but calculation error in the final step."
Bad:  "This is totally wrong!!!" or a multi-paragraph essay.

Return STRICT JSON only — no markdown, no prose, no code fences.
Schema:
{
  "results": [
    {
      "question_id": string,
      "extracted_answer": string,
      "score_suggested": number,
      "max_score": number,
      "justification": string,
      "comment": string,
      "confidence": number,
      "needs_human_review": boolean,
      "matched_criteria": string[],
      "missing_criteria": string[]
    }
  ]
}

If you cannot find an answer for a question, set extracted_answer to "" (empty string),
score_suggested to 0, confidence to 0.2 or lower, and needs_human_review to true.`;

const ResultSchema = z.object({
  question_id: z.string(),
  extracted_answer: z.string(),
  score_suggested: z.number(),
  max_score: z.number(),
  justification: z.string(),
  comment: z.string(),
  confidence: z.number(),
  needs_human_review: z.boolean(),
  matched_criteria: z.array(z.string()).default([]),
  missing_criteria: z.array(z.string()).default([]),
});
const ResponseSchema = z.object({ results: z.array(ResultSchema) });

export async function gradeWithClaude(input: GradeInput): Promise<GradeOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = process.env.ANTHROPIC_MODEL_GRADING || "claude-opus-4-7";
  const client = new Anthropic({ apiKey });

  const rubricPayload = input.questions.map((q) => ({
    question_id: q.id,
    question_number: q.question_number,
    prompt: q.prompt ?? "",
    max_points: Number(q.max_points),
    expected_answer: q.expected_answer ?? "",
    common_mistakes: q.common_mistakes ?? "",
    partial_credit: q.partial_credit ?? "",
    notes: q.notes ?? "",
  }));

  const userContent = `RUBRIC NOTES:
${input.rubricNotes?.trim() || "(none)"}

RUBRIC QUESTIONS (JSON):
${JSON.stringify(rubricPayload, null, 2)}

STUDENT TRANSCRIBED PAGES:
"""
${input.studentText.trim() || "(empty)"}
"""

Return the JSON object now.`;

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJson(raw);
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `AI returned invalid JSON: ${parsed.error.message}. Raw: ${raw.slice(0, 400)}`,
    );
  }

  // Defensive clamping — the model is usually right, but score/confidence
  // should never exceed their declared bounds regardless.
  const results: AIGradeResult[] = parsed.data.results.map((r) => ({
    ...r,
    score_suggested: clamp(r.score_suggested, 0, r.max_score),
    confidence: clamp(r.confidence, 0, 1),
  }));

  return { results };
}

/** Strip ```json fences if the model ignored instructions; parse leniently. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    // Last-ditch: find the first { ... last }
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    throw new Error("Could not parse JSON from AI response");
  }
}
