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

  // `min-h-0` on both this row and `main` caps them at the height the root
  // layout's `<body class="h-full overflow-hidden">` actually gives them
  // instead of letting a flex item grow to fit its content (the default
  // `min-height: auto` behavior) -- without it, a long weekly-session chat
  // pushes this whole shell taller than the viewport and the *page* scrolls,
  // dragging AppSidebar's bottom-anchored login/sign-out off screen with it.
  // `overflow-hidden` on `main` then forces any page that wants to scroll
  // (the chat transcript) to do it in its own inner scroll region instead.
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <AppSidebar email={user.email ?? null} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-black">
        {children}
      </main>
    </div>
  );
}
