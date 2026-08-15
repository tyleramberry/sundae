import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampRole,
  descriptionOverlap,
  replyAsksForClockTime,
  stabilizeActions,
} from "./stabilizeActions";
import { PERSONAL_ROLE } from "./weeklySessionTypes";

const roles = ["Founder", "Athlete", "Parent", "Personal"];

describe("clampRole", () => {
  it("keeps a known role and maps unknown names to Personal", () => {
    assert.equal(clampRole("athlete", roles), "Athlete");
    assert.equal(clampRole("Hobbyist", roles), PERSONAL_ROLE);
  });
});

describe("replyAsksForClockTime", () => {
  it("detects the usual follow-up phrasings", () => {
    assert.equal(replyAsksForClockTime("What time Wednesday works best?"), true);
    assert.equal(replyAsksForClockTime("Got it. Anything else for Founder?"), false);
  });
});

describe("descriptionOverlap", () => {
  it("scores an exact match as 1 and a weekend-trip slice as related", () => {
    assert.equal(descriptionOverlap("Plan the weekend trip", "plan the weekend trip"), 1);
    assert.ok(
      descriptionOverlap("Plan the weekend trip", "price out the weekend trip") >= 0.3,
    );
  });
});

describe("stabilizeActions", () => {
  it("keeps a locked item's role even if the model re-files it", () => {
    const locked = [
      { role: "Parent", description: "Read together every night", type: "habit" as const, cadenceCount: 7 },
    ];
    const incoming = [
      { role: "Athlete", description: "Read together every night", type: "habit" as const, cadenceCount: 7 },
    ];
    const out = stabilizeActions({ locked, incoming, roles, reply: "Anything else?" });
    assert.equal(out.length, 1);
    assert.equal(out[0].role, "Parent");
  });

  it("keeps a locked item the model dropped this turn", () => {
    const locked = [
      { role: "Founder", description: "Review the sales pipeline", type: "habit" as const, cadenceCount: 5 },
    ];
    const out = stabilizeActions({
      locked,
      incoming: [{ role: "Founder", description: "Ship the investor update", type: "goal" }],
      roles,
      reply: "Got it.",
    });
    assert.equal(out.some((a) => a.description === "Review the sales pipeline"), true);
    assert.equal(out.some((a) => a.description === "Ship the investor update"), true);
  });

  it("turns a this-week slice of an ongoing project into a Goal, not a second Project", () => {
    const out = stabilizeActions({
      locked: [],
      incoming: [
        { role: "Parent", description: "price out the weekend trip", type: "project" },
      ],
      roles,
      lastWeekItems: [
        { role: "Parent", type: "project", title: "Plan the weekend trip", done: false, percent: 40 },
      ],
      reply: "Anything else?",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "goal");
    assert.equal(out[0].role, "Parent");
  });

  it("drops a duplicate Project that restates an existing title", () => {
    const out = stabilizeActions({
      locked: [{ role: "Founder", description: "Close the seed round", type: "project" }],
      incoming: [
        { role: "Founder", description: "Close the seed round", type: "project" },
        { role: "Founder", description: "Close the seed round", type: "project" },
      ],
      roles,
      reply: "Anything else?",
    });
    const projects = out.filter((a) => a.type === "project");
    assert.equal(projects.length, 1);
  });

  it("strips a guessed preferredTime while the reply is still asking for one", () => {
    const out = stabilizeActions({
      locked: [{ role: "Founder", description: "Follow up with two investors", type: "goal" }],
      incoming: [
        {
          role: "Founder",
          description: "Follow up with two investors",
          type: "goal",
          preferredTime: "14:00",
        },
      ],
      roles,
      reply: "What time Wednesday works best?",
    });
    assert.equal(out[0].preferredTime, undefined);
  });

  it("keeps a preferredTime once the model is no longer asking", () => {
    const out = stabilizeActions({
      locked: [{ role: "Founder", description: "Follow up with two investors", type: "goal" }],
      incoming: [
        {
          role: "Founder",
          description: "Follow up with two investors",
          type: "goal",
          preferredTime: "16:00",
        },
      ],
      roles,
      reply: "Got it — 4pm Wednesday. Anything else?",
    });
    assert.equal(out[0].preferredTime, "16:00");
  });
});
