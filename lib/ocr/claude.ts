import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { OcrInput, OcrResult } from "./index";

// Anthropic rejects images whose base64-encoded size exceeds 5MB.
// Base64 adds ~33% overhead, so we target raw bytes well under that.
const MAX_RAW_BYTES = 3.5 * 1024 * 1024;

async function ensureUnderLimit(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_RAW_BYTES) return { buffer, mimeType };

  // Step down resolution + JPEG quality until it fits. Exam pages still
  // OCR reliably at 2000px wide; we rarely need a second pass.
  let width = 2400;
  let quality = 85;
  for (let i = 0; i < 5; i++) {
    const out = await sharp(buffer)
      .rotate() // honor EXIF orientation (phone photos)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.length <= MAX_RAW_BYTES) {
      return { buffer: out, mimeType: "image/jpeg" };
    }
    width = Math.floor(width * 0.8);
    quality = Math.max(50, quality - 10);
  }
  throw new Error("Image too large even after downscaling");
}

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

  // Downscale if the image would exceed Anthropic's 5MB base64 limit.
  const resized = await ensureUnderLimit(buffer, mimeType);
  const base64 = resized.buffer.toString("base64");
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const safeMime = (allowed as readonly string[]).includes(resized.mimeType)
    ? resized.mimeType
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
