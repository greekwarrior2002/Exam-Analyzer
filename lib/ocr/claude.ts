import Anthropic from "@anthropic-ai/sdk";
import type { OcrInput, OcrResult } from "./index";

// Privacy note: only the page image is sent to Anthropic. No student names,
// no assignment metadata, no rubric. This keeps external exposure minimal
// and avoids mixing identifying info into the OCR step.
const SYSTEM_PROMPT = `You transcribe exam pages into plain text.

Rules:
- Preserve question numbering exactly as written ("1.", "2a.", "Q3", etc).
- Preserve line breaks and spacing where they convey meaning.
- For math, use plain-text notation (e.g. "x^2", "6 CO2 + 6 H2O -> C6H12O6 + 6 O2").
- If text is unreadable, write [illegible] in place.
- Do not summarize, translate, correct spelling, or add commentary.
- Output only the transcription.`;

export async function extractTextWithClaude({
  buffer,
  mimeType,
}: OcrInput): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = process.env.ANTHROPIC_MODEL_OCR || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });

  // Anthropic expects base64 image data. Buffer → base64 is safe up to ~5MB;
  // we size-check upstream in the API route before calling here.
  const base64 = buffer.toString("base64");
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const safeMime = (allowed as readonly string[]).includes(mimeType)
    ? mimeType
    : "image/jpeg";

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: safeMime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Transcribe this exam page.",
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { text };
}
