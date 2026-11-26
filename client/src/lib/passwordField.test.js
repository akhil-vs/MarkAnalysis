import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePassword } from "./formValidation.js";
import { generatePassword, passwordFieldActions } from "./passwordField.js";

describe("generatePassword", () => {
  it("always satisfies the client password policy", () => {
    for (let i = 0; i < 40; i += 1) {
      const value = generatePassword();
      assert.equal(value.length, 12);
      assert.match(value, /[A-Z]/);
      assert.match(value, /[a-z]/);
      assert.match(value, /[0-9]/);
      assert.equal(parsePassword(value).value, value);
    }
  });
});

describe("passwordFieldActions", () => {
  it("offers show and copy on every password field", () => {
    const actions = passwordFieldActions({ visible: false, hasValue: false, allowGenerate: false });
    assert.deepEqual(
      actions.map((action) => action.id),
      ["toggle", "copy"]
    );
    assert.equal(actions[0].label, "Show password");
    assert.equal(actions[1].disabled, true);
  });

  it("adds generate and enables copy when a new password can be chosen", () => {
    const actions = passwordFieldActions({ visible: true, hasValue: true, allowGenerate: true });
    assert.deepEqual(
      actions.map((action) => action.id),
      ["toggle", "copy", "generate"]
    );
    assert.equal(actions[0].label, "Hide password");
    assert.equal(actions[1].disabled, false);
    assert.equal(actions[2].label, "Generate password");
  });
});
