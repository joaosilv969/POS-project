const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createBrandConfigStore } = require("../src/config/brand-config");

test("brand config exposes defaults when file is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-config-"));
  const store = createBrandConfigStore(dir);

  assert.equal(store.appName(), "Motoclube");
  assert.equal(store.appSubtitle(), "Gestão de vendas");
  assert.equal(store.defaultLowStockThreshold(), 5);
  assert.equal(store.receiptPrefixBar(), "V");
  assert.equal(store.receiptPrefixMerchandising(), "M");
  assert.equal(store.duesDefaultAmount(), 0);
});

test("brand config normalizes receipt prefixes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-config-"));
  fs.writeFileSync(
    path.join(dir, "brand-config.json"),
    JSON.stringify({
      receiptPrefixBar: "abc",
      receiptPrefixMerchandising: "1234",
    }),
  );
  const store = createBrandConfigStore(dir);

  assert.equal(store.receiptPrefixBar(), "ABC");
  assert.equal(store.receiptPrefixMerchandising(), "M");
});
