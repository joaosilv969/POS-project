const test = require("node:test");
const assert = require("node:assert/strict");

const { parseInteger, parseNumber } = require("../src/lib/parsing");

test("parseNumber accepts comma decimal input", () => {
  assert.equal(parseNumber("12,50"), 12.5);
});

test("parseNumber accepts currency input", () => {
  assert.equal(parseNumber("12,50 €"), 12.5);
});

test("parseNumber accepts thousands separators", () => {
  assert.equal(parseNumber("1.234,56 €"), 1234.56);
  assert.equal(parseNumber("1,234.56"), 1234.56);
});

test("parseNumber returns fallback for invalid input", () => {
  assert.equal(parseNumber("abc", 7), 7);
});

test("parseInteger returns fallback for invalid input", () => {
  assert.equal(parseInteger("abc", 9), 9);
});
