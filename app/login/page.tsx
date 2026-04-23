import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpenCheck } from "lucide-react";
import { LoginForm } from "./login-form";

// Force dynamic rendering — useSearchParams() in LoginForm needs the request URL.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <CardTitle className="text-lg">Exam Analyzer</CardTitle>
          <CardDescription>Sign in with a magic link.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-24" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
