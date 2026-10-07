import { notFound } from "next/navigation";
import { isProductionRuntime } from "@/lib/devOnly";
import DevSignInClient from "./DevSignInClient";

// Local-dev bridge for /api/debug/seed-test-account. Same fail-closed gate
// as src/app/debug/layout.tsx: Vercel sets NODE_ENV=production for production
// and preview deploys, so this route 404s in any deployed build. The OTP
// verify has to run in the browser (PKCE); the gate has to run here so the
// page never renders in production.
export default function DevSignInPage() {
  if (isProductionRuntime()) notFound();
  return <DevSignInClient />;
}
