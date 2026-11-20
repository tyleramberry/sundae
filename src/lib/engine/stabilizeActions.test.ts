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

  it("does not strip preferredTime from an unrelated new item when asking about a different one", () => {
    const out = stabilizeActions({
      locked: [],
      incoming: [
        {
          role: "Founder",
          description: "Investor call",
          type: "goal",
          weekday: 2,
          preferredTime: "10:00",
        },
        {
          role: "Personal",
          description: "Gym workout",
          type: "habit",
          cadenceCount: 3,
          preferredTime: "09:00",
        },
      ],
      roles,
      reply: "Got Investor call at 10am Tuesday. What time works best for your gym workout?",
    });
    const call = out.find((a) => a.description === "Investor call");
    const gym = out.find((a) => a.description === "Gym workout");
    assert.equal(call?.preferredTime, "10:00");
    assert.equal(gym?.preferredTime, undefined);
  });
});

describe("findIncompleteSchedulingActions", () => {
  it("flags missing day, time, and duration on habits/goals and ignores projects", async () => {
    const { findIncompleteSchedulingActions, buildMissingSpecificsFollowUp } = await import(
      "@/lib/engine/weeklySession"
    );
    const incomplete = findIncompleteSchedulingActions([
      { role: "Founder", description: "Close seed round", type: "project" },
      { role: "Personal", description: "Gym workout", type: "habit", cadenceCount: 3 },
      {
        role: "Personal",
        description: "Morning prayer",
        type: "habit",
        cadenceCount: 7,
        preferredTime: "07:00",
        durationMinutes: 15,
      },
      {
        role: "Founder",
        description: "Send deck",
        type: "goal",
        weekday: 3,
        preferredTime: "14:00",
      },
    ]);

    assert.equal(incomplete.length, 2);
    assert.equal(incomplete[0].action.description, "Gym workout");
    assert.deepEqual(incomplete[0].missing, ["day", "time", "duration"]);
    assert.equal(incomplete[1].action.description, "Send deck");
    assert.deepEqual(incomplete[1].missing, ["duration"]);

    const followUp = buildMissingSpecificsFollowUp(incomplete);
    assert.match(followUp, /Gym workout.*which days, what time, and how long/);
    assert.match(followUp, /Send deck.*how long/);
  });
});
