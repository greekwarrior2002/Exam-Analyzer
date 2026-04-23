/**
 * AI grading service. Given the student's transcribed pages and a rubric,
 * returns one structured suggestion per rubric question. Never decides final
 * grades — the UI keeps the human in the loop.
 */

import { gradeWithClaude } from "./claude";
import type { AIGradeResult, RubricQuestion } from "@/lib/types";

export interface GradeInput {
  rubricNotes: string | null;
  questions: RubricQuestion[];
  /** Full OCR text of all pages, concatenated in page order. */
  studentText: string;
}

export interface GradeOutput {
  results: AIGradeResult[];
}

export async function gradeSubmission(input: GradeInput): Promise<GradeOutput> {
  return gradeWithClaude(input);
}
