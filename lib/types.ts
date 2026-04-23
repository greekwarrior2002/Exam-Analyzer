// Shared domain types. Mirrors the SQL schema.
// Keep numeric fields as number (pg numeric → string by default in pg; Supabase
// returns them as number when parsing works, else string — we coerce on read).

export type AssignmentStatus = "active" | "archived";
export type SubmissionStatus =
  | "uploaded"
  | "ocr_done"
  | "graded"
  | "reviewed"
  | "exported";
export type OcrStatus = "pending" | "processing" | "done" | "error";

export interface Assignment {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  total_points: number | null;
  status: AssignmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Rubric {
  id: string;
  assignment_id: string;
  user_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RubricQuestion {
  id: string;
  rubric_id: string;
  user_id: string;
  position: number;
  question_number: string;
  prompt: string | null;
  max_points: number;
  expected_answer: string | null;
  common_mistakes: string | null;
  partial_credit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  user_id: string;
  name: string;
  external_id: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string | null;
  user_id: string;
  status: SubmissionStatus;
  total_score: number | null;
  max_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionPage {
  id: string;
  submission_id: string;
  user_id: string;
  page_number: number;
  storage_path: string;
  mime_type: string | null;
  ocr_text: string | null;
  ocr_status: OcrStatus;
  ocr_error: string | null;
  created_at: string;
}

export interface GradedAnswer {
  id: string;
  submission_id: string;
  rubric_question_id: string;
  user_id: string;
  extracted_answer: string | null;
  score_suggested: number | null;
  justification: string | null;
  comment_suggested: string | null;
  confidence: number | null;
  needs_human_review: boolean;
  matched_criteria: string[];
  missing_criteria: string[];
  score_final: number | null;
  comment_final: string | null;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Shape returned by the AI grading service, per question.
export interface AIGradeResult {
  question_id: string;
  extracted_answer: string;
  score_suggested: number;
  max_score: number;
  justification: string;
  comment: string;
  confidence: number;
  needs_human_review: boolean;
  matched_criteria: string[];
  missing_criteria: string[];
}
