import { notFound } from "next/navigation";
import { isProductionRuntime } from "@/lib/devOnly";

// Entire /debug/* tree is local-dev scaffolding. 404 in any production
// build (including Vercel previews) so it never ships as a product surface.
export default function DebugLayout({ children }: { children: React.ReactNode }) {
  if (isProductionRuntime()) notFound();
  return children;
}
