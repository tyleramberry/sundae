"use client";

import { useState } from "react";
import type { ProposedBlock } from "@/lib/planning/blocks";

// Raw debug view for the block-proposal logic (Day 8). Pulls the signed-in
// user's onboarding answers + current-week calendar and shows the proposed
// blocks the engine would suggest — nothing gets written to the calendar
// from this screen, same read-only scope as the logic it's exercising.
export default function ProposeDebugPage() {
  const [blocks, setBlocks] = useState<ProposedBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadProposal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planning/propose");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Unknown error");
        setBlocks(null);
        return;
      }
      setBlocks(body.blocks);
    } finally {
      setLoading(false);
    }
  }

  function formatRange(start: string, end: string) {
    const s = new Date(start);
    const e = new Date(end);
    const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const time = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day}, ${time(s)}–${time(e)}`;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 font-mono dark:bg-black">
      <h1 className="font-sans text-2xl font-semibold text-black dark:text-zinc-50">
        Block-proposal debug view
      </h1>

      <div className="flex gap-3 font-sans">
        <button
          onClick={loadProposal}
          disabled={loading}
          className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Proposing…" : "Propose blocks"}
        </button>
      </div>

      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      {blocks && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-sans text-sm font-medium text-zinc-500">
              Proposed blocks ({blocks.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {blocks.map((b, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <span className="font-sans font-medium">{b.role}</span>
                  <span className="font-sans text-zinc-500"> — {b.goal}</span>
                  <div className="text-xs text-zinc-500">
                    {formatRange(b.start, b.end)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-sans text-sm font-medium text-zinc-500">Raw response</h2>
            <pre className="mt-1 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-black dark:bg-zinc-900 dark:text-zinc-100">
              {JSON.stringify(blocks, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
