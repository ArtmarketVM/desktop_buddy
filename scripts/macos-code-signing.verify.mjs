import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signingPolicy,
  internalRequirement,
  validateInternalRequirement,
} from "./macos-code-signing.mjs";

test("the internal macOS identity pins the reviewed public certificate", () => {
  const policy = signingPolicy();
  assert.equal(policy.mode, "internal");
  assert.match(policy.certificateSha256, /^[a-f0-9]{64}$/);
  const expected = internalRequirement("com.artmarketvm.desktopbuddy");
  assert.doesNotThrow(() => validateInternalRequirement(expected, expected));
  for (const invalid of [
    'cdhash H"1234"',
    'identifier "com.artmarketvm.desktopbuddy"',
    internalRequirement("com.artmarketvm.otherapp"),
    internalRequirement("com.artmarketvm.desktopbuddy", {
      certificateSha1: "0".repeat(40),
    }),
  ])
    assert.throws(
      () => validateInternalRequirement(invalid, expected),
      /exact certificate-bound/,
    );
});

test("signing requirements reject injected identifiers and malformed certificate pins", () => {
  assert.throws(() => internalRequirement('app" or true'), /Invalid/);
  assert.throws(
    () =>
      internalRequirement("com.example.app", { certificateSha1: "not-a-pin" }),
    /Invalid/,
  );
});
