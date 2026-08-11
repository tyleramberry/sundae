import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/AppSidebar";

// Shared shell for the signed-in app (Day 11 UI/UX polish). A route group,
// so the URLs stay /weekly-session, /daily-follow-ups, /dashboard -- the
// (app) segment doesn't appear in the path, it just scopes this layout to
// those three pages and keeps the marketing/onboarding routes out of the
// sidebar. Auth is enforced here once, server-side, instead of each page
// re-checking on the client.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar email={user.email ?? null} />
      <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
        {children}
      </main>
    </div>
  );
}
