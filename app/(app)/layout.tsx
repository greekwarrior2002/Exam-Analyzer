import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/nav";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/utils";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  // Belt-and-suspenders: even though middleware redirects, enforce allowlist
  // in server-rendered layout too. Anyone not on the list is bounced.
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not_allowed");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav email={user.email} />
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
