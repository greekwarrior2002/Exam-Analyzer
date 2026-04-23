"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ImageIcon, X, Sparkles, Camera } from "lucide-react";
import { toast } from "sonner";

interface Props {
  assignmentId: string;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per page
const ACCEPTED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function UploadDropzone({ assignmentId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [studentName, setStudentName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoRunOcr, setAutoRunOcr] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const filtered = arr.filter((f) => {
      if (!ACCEPTED_MIMES.has(f.type)) {
        toast.error(`${f.name}: not a supported image`);
        return false;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name}: larger than 15MB`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...filtered]);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim()) {
      toast.error("Student name is required");
      return;
    }
    if (files.length === 0) {
      toast.error("Add at least one page");
      return;
    }

    setUploading(true);
    setProgress(5);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");

      const { data: student, error: stuErr } = await supabase
        .from("students")
        .insert({
          user_id: user.id,
          name: studentName.trim(),
          external_id: externalId.trim() || null,
        })
        .select()
        .single();
      if (stuErr || !student) throw stuErr;

      const { data: sub, error: subErr } = await supabase
        .from("submissions")
        .insert({
          user_id: user.id,
          assignment_id: assignmentId,
          student_id: student.id,
        })
        .select()
        .single();
      if (subErr || !sub) throw subErr;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() || "jpg";
        // path follows the storage RLS convention: {user_id}/...
        const path = `${user.id}/${assignmentId}/${sub.id}/page-${i + 1}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("exams")
          .upload(path, f, {
            contentType: f.type,
            upsert: false,
          });
        if (upErr) throw upErr;

        const { error: pageErr } = await supabase.from("submission_pages").insert({
          user_id: user.id,
          submission_id: sub.id,
          page_number: i + 1,
          storage_path: path,
          mime_type: f.type,
        });
        if (pageErr) throw pageErr;

        setProgress(Math.round(((i + 1) / files.length) * (autoRunOcr ? 70 : 100)));
      }

      if (autoRunOcr) {
        setProgress(75);
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ submission_id: sub.id }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`OCR failed: ${msg}`);
        }
        setProgress(100);
      }

      toast.success("Submission uploaded");
      router.push(`/assignments/${assignmentId}/grade/${sub.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Student name</Label>
            <Input
              id="name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              required
              placeholder="Alex Kim"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext">Student ID (optional)</Label>
            <Input
              id="ext"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="S-0042"
            />
          </div>
        </CardContent>
      </Card>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm">Drag, drop, or tap below</p>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, or WebP · multiple pages OK
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4" /> Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <ImageIcon className="h-4 w-4" /> Choose files
          </Button>
        </div>
        {/*
          Two hidden inputs:
          - cameraRef forces the camera on iOS/Android via `capture="environment"`.
          - inputRef is a normal file picker; iOS still offers Camera + Photos there.
        */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <Label>Pages ({files.length})</Label>
          <ul className="grid gap-2 sm:grid-cols-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(f.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="autorun"
          type="checkbox"
          checked={autoRunOcr}
          onChange={(e) => setAutoRunOcr(e.target.checked)}
          className="h-4 w-4 rounded border"
        />
        <Label htmlFor="autorun" className="cursor-pointer">
          Run OCR automatically after upload
        </Label>
      </div>

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">
            {progress < 70 ? "Uploading images…" : "Extracting text from pages…"}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={uploading}>
          <Sparkles className="h-4 w-4" />
          {uploading ? "Working…" : "Upload & extract"}
        </Button>
      </div>
    </form>
  );
}
