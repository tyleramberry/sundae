import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "./capi";

describe("sha256Hex", () => {
  it("hashes a trimmed lowercase email the way Meta CAPI expects", () => {
    assert.equal(
      sha256Hex("  User@Example.COM "),
      sha256Hex("user@example.com"),
    );
    assert.equal(
      sha256Hex("user@example.com"),
      "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514",
    );
  });
});
