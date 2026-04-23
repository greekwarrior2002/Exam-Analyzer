import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractText } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  submission_id: z.string().uuid(),
});

/**
 * Runs OCR on every pending page for a submission. Updates submission_pages
 * rows and flips the submission status to 'ocr_done' when all pages finish.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { submission_id } = parsed.data;

  // RLS ensures the user can only see their own submission.
  const { data: submission, error: subErr } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", submission_id)
    .single();
  if (subErr || !submission) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: pages, error: pagesErr } = await supabase
    .from("submission_pages")
    .select("id, storage_path, mime_type, ocr_status, page_number")
    .eq("submission_id", submission_id)
    .order("page_number", { ascending: true });
  if (pagesErr) {
    return NextResponse.json({ error: pagesErr.message }, { status: 500 });
  }

  const admin = createAdminClient();
  let ok = 0;
  let failed = 0;

  for (const p of pages ?? []) {
    if (p.ocr_status === "done") {
      ok += 1;
      continue;
    }
    await supabase
      .from("submission_pages")
      .update({ ocr_status: "processing", ocr_error: null })
      .eq("id", p.id);

    try {
      // Admin client used only to download from the private bucket into Node
      // memory. The bytes never leave the server except to the OCR provider.
      const { data: file, error: dlErr } = await admin.storage
        .from("exams")
        .download(p.storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message || "download failed");

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await extractText({
        buffer,
        mimeType: p.mime_type || file.type || "image/jpeg",
      });

      await supabase
        .from("submission_pages")
        .update({ ocr_status: "done", ocr_text: result.text })
        .eq("id", p.id);
      ok += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("submission_pages")
        .update({ ocr_status: "error", ocr_error: msg })
        .eq("id", p.id);
      failed += 1;
    }
  }

  if (failed === 0 && ok > 0) {
    await supabase
      .from("submissions")
      .update({ status: "ocr_done" })
      .eq("id", submission_id);
  }

  return NextResponse.json({ ok, failed, total: pages?.length ?? 0 });
}
