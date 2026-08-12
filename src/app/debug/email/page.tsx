"use client";

import { useState } from "react";

type TodayItem = { id: string; role: string; title: string; type: "habit" | "goal" };
type OngoingProject = { id: string; role: string; title: string; percent: number };
type TodayBrief = {
  dateISO: string;
  weekdayLabel: string;
  todayItems: TodayItem[];
  ongoingProjects: OngoingProject[];
};
type NudgeCopy = { greeting: string; focusLine: string };

type DebugResult = {
  brief: TodayBrief;
  copy: NudgeCopy;
  subject: string;
  html: string;
  text: string;
};

// Raw debug view for the daily follow-up email. Three things live here:
// 1. A real send to your own signed-in address via Resend.
// 2. A static example-data preview (no auth, no model call -- what
//    /api/email/daily-follow-up/preview always renders).
// 3. The REAL brief + REAL agent output for your own signed-in account,
//    read-only -- no send, no Resend key needed. This is what actually
//    proves out src/lib/dailyBrief/gather.ts and
//    src/lib/agents/dailyNudgeAgent.ts without spending a real send.
export default function EmailDebugPage() {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  async function sendTest() {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      const res = await fetch("/api/email/daily-follow-up", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setSendError(body.error ?? "Unknown error");
        return;
      }
      setSendResult(`Sent — Resend id ${body.id}`);
    } finally {
      setSending(false);
    }
  }

  async function generateRealBrief() {
    setDebugLoading(true);
    setDebugResult(null);
    setDebugError(null);
    try {
      const res = await fetch("/api/email/daily-follow-up/debug");
      const body = await res.json();
      if (!res.ok) {
        setDebugError(body.error ?? "Unknown error");
        return;
      }
      setDebugResult(body as DebugResult);
    } finally {
      setDebugLoading(false);
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

      {sendResult && <p className="font-sans text-sm text-emerald-600">{sendResult}</p>}
      {sendError && <p className="font-sans text-sm text-red-600">{sendError}</p>}

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          Example preview (static, no auth, no model call)
        </h2>
        <iframe
          src="/api/email/daily-follow-up/preview"
          title="Daily follow-up email example preview"
          className="mt-2 h-48 w-full max-w-lg rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
        />
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          Your real brief — real gather, real agent, no send
        </h2>
        <button
          onClick={generateRealBrief}
          disabled={debugLoading}
          className="mt-2 rounded-full border border-zinc-300 px-4 py-2 font-sans text-sm text-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          {debugLoading ? "Gathering + generating…" : "Generate my real brief"}
        </button>

        {debugError && (
          <p className="mt-3 font-sans text-sm text-red-600">{debugError}</p>
        )}

        {debugResult && (
          <div className="mt-4 flex max-w-2xl flex-col gap-4">
            <div>
              <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-zinc-500">
                Agent output (raw)
              </h3>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
{JSON.stringify(debugResult.copy, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-zinc-500">
                Gathered brief (raw)
              </h3>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
{JSON.stringify(debugResult.brief, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-zinc-500">
                Rendered email — subject: {debugResult.subject}
              </h3>
              <iframe
                srcDoc={debugResult.html}
                title="Real daily brief preview"
                className="mt-1 h-64 w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
