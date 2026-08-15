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

  // This shell owns its own viewport pinning: `h-dvh overflow-hidden` here,
  // not on <body>. It used to inherit a capped height from the root layout's
  // `<body class="h-full overflow-hidden">`, but that clipped every *other*
  // route too (see the comment in src/app/layout.tsx), so the cap moved down
  // here where only the signed-in pages get it.
  //
  // Note there's deliberately no `flex-1` here. <body> is a column flex
  // container, so `flex-1` would resolve to `flex-basis: 0%` on the main
  // (vertical) axis -- which beats `h-dvh` -- and then grow this shell to
  // whatever its content wants. On mobile, where the sidebar stacks above
  // `main` instead of beside it, that grew the shell past the viewport and
  // put the scroll back on the page. `h-dvh` alone pins it in both layouts.
  //
  // `min-h-0` on both this row and `main` then keeps them at that pinned
  // height instead of letting a flex item grow to fit its content (the
  // default `min-height: auto` behavior) -- without it, a long weekly-session
  // chat pushes this whole shell taller than the viewport and the *page*
  // scrolls, dragging AppSidebar's bottom-anchored login/sign-out off screen
  // with it. `overflow-hidden` on `main` then forces any page that wants to
  // scroll (the chat transcript) to do it in its own inner scroll region.
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden md:flex-row">
      <AppSidebar email={user.email ?? null} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-black">
        {children}
      </main>
    </div>
  );
}
