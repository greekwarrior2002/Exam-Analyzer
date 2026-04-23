/**
 * OCR abstraction layer. The grading pipeline only talks to this module,
 * so swapping in Google Vision, Tesseract, or a different provider is a
 * single-file change.
 */

import { extractTextWithClaude } from "./claude";

export interface OcrInput {
  /** Raw image bytes. */
  buffer: Buffer;
  /** MIME type, e.g. "image/jpeg". */
  mimeType: string;
}

export interface OcrResult {
  text: string;
  /** Provider-reported confidence, if any. 0..1. */
  confidence?: number;
}

export async function extractText(input: OcrInput): Promise<OcrResult> {
  // Claude Vision handles handwriting + printed text well and keeps the
  // infra surface tiny (one API key). Swap here if you switch providers.
  return extractTextWithClaude(input);
}
