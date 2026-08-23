// Session-recap email -- sent once a weekly planning session finishes
// (right after /api/weekly-session/confirm writes the new week's items).
// Three sections: wins and improvements (from the real transcript, via
// src/lib/agents/sessionRecapAgent.ts) and a KPI tile per role for the
// week that just closed out (real numbers, computed the same way the
// dashboard does -- see src/lib/kpi/compute.ts -- not narrated by a
// model). Same raw-fetch-against-Resend style as dailyFollowUp.ts.

import type { RoleKpi } from "@/lib/kpi/compute";
import type { SessionRecap } from "@/lib/agents/sessionRecapAgent";

const RESEND_API = "https://api.resend.com/emails";

export class EmailError extends Error {}

export type SessionRecapEmail = {
  subject: string;
  html: string;
  text: string;
};

function resolveAppUrl(appUrl?: string): string {
  return appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "production" ? "https://sundaeplanner.com" : "http://localhost:3000");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekLabel(weekStartISO: string): string {
  const d = new Date(`${weekStartISO}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export function buildSessionRecapEmail(
  input: {
    weekStart: string; // the week that just closed, yyyy-mm-dd
    recap: SessionRecap;
    roleKpis: RoleKpi[];
  },
  appUrl?: string,
): SessionRecapEmail {
  const base = resolveAppUrl(appUrl);
  const url = `${base.replace(/\/$/, "")}/dashboard`;
  const label = weekLabel(input.weekStart);
  const { wins, improvements } = input.recap;
  const hasRecap = wins.length > 0 || improvements.length > 0;

  const subject = `Week of ${label}, recapped`;

  const kpiLines = input.roleKpis
    .map((k) => `- ${k.role}: ${k.numerator}/${k.denominator}${k.percent !== null ? ` (${k.percent}%)` : ""}`)
    .join("\n");

  const text = [
    `Week of ${label} — recap`,
    "",
    hasRecap ? "Wins:" : null,
    wins.length > 0 ? wins.map((w) => `- ${w}`).join("\n") : wins.length === 0 && hasRecap ? "  (none noted)" : null,
    "",
    hasRecap ? "To improve:" : null,
    improvements.length > 0
      ? improvements.map((i) => `- ${i}`).join("\n")
      : improvements.length === 0 && hasRecap
        ? "  (none noted)"
        : null,
    "",
    "By role:",
    input.roleKpis.length > 0 ? kpiLines : "  Nothing planned that week.",
    "",
    `See this week's plan → ${url}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  // Calm-identity retheme (spec #3). Same palette + typography rules
  // hand-swapped here as in dailyFollowUp.ts -- email inline styles
  // don't inherit from globals.css. Ink #1C1917 for body, ink-secondary
  // #78716C for meta/labels, border #DDD6CC for dividers, accent
  // #7A9E7E on the CTA, canvas #FAF7F2 wrapping the container.
  const listHtml = (items: string[]) =>
    items.length > 0
      ? `<ul style="margin:0;padding-left:18px;">${items
          .map((i) => `<li style="font-size:14.5px;color:#1C1917;padding:3px 0;line-height:1.65;">${escapeHtml(i)}</li>`)
          .join("")}</ul>`
      : `<p style="font-size:13.5px;color:#C4BAB1;margin:0;line-height:1.65;">None noted.</p>`;

  const kpiHtml =
    input.roleKpis.length > 0
      ? `<table style="width:100%;border-collapse:collapse;">
      ${input.roleKpis
        .map(
          (k) => `<tr>
          <td style="padding:8px 0;border-top:1px solid #DDD6CC;font-size:14px;color:#1C1917;line-height:1.65;">${escapeHtml(k.role)}</td>
          <td style="padding:8px 0;border-top:1px solid #DDD6CC;font-size:14px;color:#78716C;text-align:right;line-height:1.65;">
            ${k.numerator}/${k.denominator}${k.percent !== null ? ` &middot; ${k.percent}%` : ""}
          </td>
        </tr>`,
        )
        .join("")}
    </table>`
      : `<p style="font-size:14px;color:#78716C;margin:0;line-height:1.65;">Nothing was planned that week.</p>`;

  const recapSectionsHtml = hasRecap
    ? `<p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#78716C;margin:0 0 6px;">Wins</p>
       ${listHtml(wins)}
       <p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#78716C;margin:20px 0 6px;">To improve</p>
       ${listHtml(improvements)}
       <p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#78716C;margin:24px 0 6px;">By role</p>`
    : `<p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#78716C;margin:0 0 6px;">By role</p>`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAF7F2; color: #1C1917; line-height: 1.65;">
  <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716C; margin: 0 0 4px;">Sundae</p>
  <p style="font-size: 20px; font-weight: 600; color: #1C1917; line-height: 1.4; letter-spacing: 0.01em; margin: 0 0 20px;">Week of ${escapeHtml(label)}</p>

  ${recapSectionsHtml}
  ${kpiHtml}

  <a href="${url}" style="display: inline-block; margin-top: 28px; background: #7A9E7E; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 999px; font-size: 14px; font-weight: 500;">
    See this week&rsquo;s plan &rarr;
  </a>
</div>`;

  return { subject, html, text };
}

export type SendSessionRecapInput = {
  to: string;
  weekStart: string;
  recap: SessionRecap;
  roleKpis: RoleKpi[];
  appUrl?: string;
};

export async function sendSessionRecapEmail(
  input: SendSessionRecapInput,
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailError(
      "RESEND_API_KEY is not set. Add a Resend API key to .env.local (and RESEND_FROM_EMAIL, once a sending domain is verified) to send real email.",
    );
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Sundae <onboarding@resend.dev>";
  const { subject, html, text } = buildSessionRecapEmail(
    { weekStart: input.weekStart, recap: input.recap, roleKpis: input.roleKpis },
    input.appUrl,
  );

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: input.to, subject, html, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new EmailError(`Failed to send session-recap email: ${body}`);
  }

  return response.json();
}
