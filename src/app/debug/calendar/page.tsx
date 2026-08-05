"use client";

import { useEffect, useState } from "react";

// Raw debug view: pulls the signed-in user's current-week events and shows
// the actual JSON response. Also lets you fire the write function. This is
// the Day 5 proof-of-concept screen (and the recording target for today's
// content post).
export default function CalendarDebugPage() {
  const [events, setEvents] = useState<unknown>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<unknown>(null);

  async function loadEvents() {
    setEventsError(null);
    const res = await fetch("/api/calendar/events");
    const body = await res.json();
    if (!res.ok) {
      setEventsError(body.error ?? "Unknown error");
      setEvents(null);
      return;
    }
    setEvents(body);
  }

  useEffect(() => {
    void (async () => {
      await loadEvents();
    })();
  }, []);

  async function handleCreateTestEvent() {
    setCreating(true);
    setCreated(null);
    try {
      const res = await fetch("/api/calendar/test-event", { method: "POST" });
      const body = await res.json();
      setCreated(body);
      if (res.ok) await loadEvents();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 font-mono dark:bg-black">
      <h1 className="font-sans text-2xl font-semibold text-black dark:text-zinc-50">
        Calendar debug view
      </h1>

      <div className="flex gap-3 font-sans">
        <button
          onClick={loadEvents}
          className="rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Refresh events
        </button>
        <button
          onClick={handleCreateTestEvent}
          disabled={creating}
          className="rounded-full border border-black px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-white dark:text-white"
        >
          {creating ? "Creating…" : "Create test event"}
        </button>
      </div>

      {eventsError && (
        <p className="font-sans text-sm text-red-600">{eventsError}</p>
      )}

      {created !== null && (
        <div>
          <h2 className="font-sans text-sm font-medium text-zinc-500">
            Last write response
          </h2>
          <pre className="mt-1 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-black dark:bg-zinc-900 dark:text-zinc-100">
            {JSON.stringify(created, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          This week&apos;s events (raw)
        </h2>
        <pre className="mt-1 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-black dark:bg-zinc-900 dark:text-zinc-100">
          {JSON.stringify(events, null, 2)}
        </pre>
      </div>
    </div>
  );
}
