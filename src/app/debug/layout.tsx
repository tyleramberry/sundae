import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDebugSurfaceAllowedForEmail, isProductionRuntime } from "@/lib/devOnly";

// /debug/* is open in local dev and for signed-in test accounts in production
// (see src/lib/testAccount.ts). Everyone else gets a 404 in production.
export default async function DebugLayout({ children }: { children: React.ReactNode }) {
  if (isProductionRuntime()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!isDebugSurfaceAllowedForEmail(user?.email)) {
      notFound();
    }
  }
  return children;
}
