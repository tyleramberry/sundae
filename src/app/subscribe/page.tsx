import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubscribeCheckout from "./SubscribeCheckout";

// Lives outside the (app) route group on purpose: the signed-in shell
// redirects here when billing is missing, so putting /subscribe under
// that layout would loop.
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; checkout?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/subscribe");
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (sub?.status === "trialing" || sub?.status === "active") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  return (
    <SubscribeCheckout
      resubscribe={params.reason === "resubscribe"}
      checkoutCanceled={params.checkout === "canceled"}
    />
  );
}
