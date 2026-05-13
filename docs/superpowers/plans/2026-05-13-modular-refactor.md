# Modular Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split low-risk shared logic out of the 3,000-line Express server while preserving current behavior.

**Architecture:** Keep `src/server.js` as the app composition entry point for this pass. Extract pure helpers, brand configuration, auth middleware, flash handling, async route wrapping, and product upload helpers into focused CommonJS modules.

**Tech Stack:** Node.js, Express, EJS, MariaDB via `mysql2/promise`, Node built-in test runner.

---

## File Structure

- Create `src/lib/parsing.js`: `parseNumber`, `parseInteger`, `currentYear`.
- Create `src/lib/formatting.js`: `money`, `formatDateTime`.
- Create `src/lib/async-route.js`: async Express wrapper.
- Create `src/lib/flash.js`: session flash helper.
- Create `src/config/brand-config.js`: file-backed brand config factory and defaults.
- Create `src/middleware/auth.js`: `requireAuth`, `requireAdmin`.
- Create `src/uploads/product-images.js`: multer upload and product image helpers.
- Create `test/parsing.test.js`: helper regression tests.
- Create `test/brand-config.test.js`: brand config regression tests.
- Modify `src/server.js`: import and use extracted modules.
- Modify `package.json`: add `test` script.
- Modify `.env.example`: fix `ADMIN_CANCEL_PIN` formatting.
- Modify `README.md`: clarify Compose file roles.

### Task 1: Add Test Script And Pure Helper Tests

**Files:**
- Modify: `package.json`
- Create: `test/parsing.test.js`

- [ ] **Step 1: Add the Node test script**

Update `package.json` scripts:

```json
"test": "node --test",
"check": "node --check src/server.js && node --check scripts/init-db.js"
```

- [ ] **Step 2: Write failing parsing tests**

Create `test/parsing.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `src/lib/parsing` does not exist.

- [ ] **Step 4: Create `src/lib/parsing.js`**

```js
function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function parseInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function currentYear() {
  return new Date().getFullYear();
}

module.exports = {
  currentYear,
  parseInteger,
  parseNumber,
};
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

### Task 2: Extract Brand Config With Tests

**Files:**
- Create: `src/config/brand-config.js`
- Create: `test/brand-config.test.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write failing brand config tests**

Create `test/brand-config.test.js`:

```js
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
      receiptPrefixMerchandising: "1234"
    }),
  );
  const store = createBrandConfigStore(dir);

  assert.equal(store.receiptPrefixBar(), "ABC");
  assert.equal(store.receiptPrefixMerchandising(), "M");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `src/config/brand-config` does not exist.

- [ ] **Step 3: Create `src/config/brand-config.js`**

Implement the existing brand defaults and file persistence as a factory that returns `get`, `set`, `save`, and the existing helper methods.

- [ ] **Step 4: Update `src/server.js` to use the store**

Replace direct `brandConfig` state and helper functions with calls to the store.

- [ ] **Step 5: Run tests and syntax check**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: PASS.

### Task 3: Extract Express Shared Helpers

**Files:**
- Create: `src/lib/formatting.js`
- Create: `src/lib/async-route.js`
- Create: `src/lib/flash.js`
- Create: `src/middleware/auth.js`
- Modify: `src/server.js`

- [ ] **Step 1: Move formatting helpers**

Create `src/lib/formatting.js` with the current `money` and `formatDateTime` behavior.

- [ ] **Step 2: Move Express helper modules**

Create `src/lib/async-route.js`, `src/lib/flash.js`, and `src/middleware/auth.js`.

- [ ] **Step 3: Update `src/server.js` imports**

Remove duplicate local helper definitions and import the new modules.

- [ ] **Step 4: Run verification**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: PASS.

### Task 4: Extract Product Upload Helpers

**Files:**
- Create: `src/uploads/product-images.js`
- Modify: `src/server.js`

- [ ] **Step 1: Create upload helper module**

Move allowed image type validation, multer storage, `uploadProductImage`, `deleteUpload`, `removeProductImages`, and `saveProductImage` into `src/uploads/product-images.js`.

- [ ] **Step 2: Wire dependencies explicitly**

Export a factory that accepts `{ uploadDir, pool, flash }` so the module does not create global database or session dependencies.

- [ ] **Step 3: Update `src/server.js`**

Instantiate the upload helpers once and keep all existing route behavior unchanged.

- [ ] **Step 4: Run verification**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: PASS.

### Task 5: Documentation Cleanup

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Fix env example**

Remove the leading space before `ADMIN_CANCEL_PIN=1234`.

- [ ] **Step 2: Clarify Compose files**

Update the project structure and Docker Compose instructions so `docker-compose.yaml` is described as the named-volume recommended file and `docker-compose.yml` as the fixed host path variant.

- [ ] **Step 3: Run final verification**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: PASS.
