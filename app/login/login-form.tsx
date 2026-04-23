"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ERROR_COPY: Record<string, string> = {
  missing_code: "Auth code missing. Try the magic link again.",
  auth_failed: "We couldn't verify that link. Try again.",
  not_allowed: "That email isn't on the allowlist for this app.",
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const nextParam = params.get("next") || "/";
  const errorKey = params.get("error");
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? "Login failed." : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(nextParam)}`,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email for a magic link.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send link.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-sm text-muted-foreground">
        Sent a link to <span className="font-medium text-foreground">{email}</span>.
        Check your inbox.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send magic link"}
      </Button>
    </form>
  );
}
