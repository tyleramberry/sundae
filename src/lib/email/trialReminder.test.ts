import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTrialReminderEmail } from "./trialReminder";

describe("buildTrialReminderEmail", () => {
  it("uses the specified subject and key phrases", () => {
    const email = buildTrialReminderEmail("https://sundaeplanner.com");
    assert.equal(email.subject, "Your Sundae trial ends tomorrow");
    assert.match(email.text, /trial ends tomorrow/i);
    assert.match(email.text, /card will be charged/i);
    assert.match(email.text, /Manage subscription/);
    assert.match(email.text, /https:\/\/sundaeplanner.com\/dashboard/);
    assert.match(email.html, /#FAF7F2/);
    assert.match(email.html, /#7A9E7E/);
    assert.match(email.html, /Manage subscription/);
  });

  it("does not throw without an app URL override", () => {
    assert.doesNotThrow(() => buildTrialReminderEmail());
  });
});
