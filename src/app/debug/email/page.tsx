"use client";

import { useState } from "react";

// Raw debug view for the daily follow-up email (Day 10 v1): renders the
// actual HTML in an iframe, and lets you fire a real test send to your own
// signed-in address via Resend. If RESEND_API_KEY isn't set yet, the send
// button surfaces that clearly instead of failing silently -- see
// src/lib/email/dailyFollowUp.ts.
export default function EmailDebugPage() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTest() {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/email/daily-follow-up", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Unknown error");
        return;
      }
      setResult(`Sent — Resend id ${body.id}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 font-mono dark:bg-black">
      <h1 className="font-sans text-2xl font-semibold text-black dark:text-zinc-50">
        Daily follow-up email — debug view
      </h1>

      <div className="flex gap-3 font-sans">
        <button
          onClick={sendTest}
          disabled={sending}
          className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {sending ? "Sending…" : "Send test email to my account"}
        </button>
      </div>

      {result && <p className="font-sans text-sm text-emerald-600">{result}</p>}
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">Rendered preview</h2>
        <iframe
          src="/api/email/daily-follow-up/preview"
          title="Daily follow-up email preview"
          className="mt-2 h-48 w-full max-w-lg rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
        />
      </div>
    </div>
  );
}
