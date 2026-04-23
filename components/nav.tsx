"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookOpenCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

interface NavProps {
  email?: string | null;
}

export function TopNav({ email }: NavProps) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Assignments" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpenCheck className="h-4 w-4" />
            </div>
            <span>Exam Analyzer</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  pathname === i.href && "bg-accent text-foreground",
                )}
              >
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {email && (
            <form action="/api/auth/signout" method="post">
              <Button variant="ghost" size="sm" type="submit" title={email}>
                Sign out
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
