import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const QuerySchema = z.object({ path: z.string().min(1) });

/**
 * Returns a short-lived signed URL for a page image. The requesting user
 * must own the path — we verify by matching the first path segment to their
 * auth.uid().
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ path: url.searchParams.get("path") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const path = parsed.data.path;
  const firstSegment = path.split("/")[0];
  if (firstSegment !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("exams")
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
