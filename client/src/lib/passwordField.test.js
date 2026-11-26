import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePassword } from "./formValidation.js";
import { generatePassword } from "./passwordField.js";

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
