const test = require("node:test");
const assert = require("node:assert/strict");

const { parseInteger, parseNumber } = require("../src/lib/parsing");

test("parseNumber accepts comma decimal input", () => {
  assert.equal(parseNumber("12,50"), 12.5);
});

test("parseNumber returns fallback for invalid input", () => {
  assert.equal(parseNumber("abc", 7), 7);
});

test("parseInteger returns fallback for invalid input", () => {
  assert.equal(parseInteger("abc", 9), 9);
});
