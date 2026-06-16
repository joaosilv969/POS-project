# Stock Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/stock` and `/stock/merchandising` with inventory filters, KPIs, visuals, exports, and shared movement handling.

**Architecture:** Add stock helper functions, refactor stock route orchestration in `src/server.js`, update `src/views/stock.ejs`, and add small CSS support if needed.

**Tech Stack:** Node.js, Express, EJS, MariaDB, Node built-in test runner, CSS.

---

### Task 1: Stock Helper Tests

**Files:**
- Modify: `test/report-utils.test.js`
- Modify: `src/services/report-utils.js`

- [ ] Add failing tests for stock filter normalization and query serialization.
- [ ] Implement helpers.
- [ ] Run `npm test`.

### Task 2: Route Data

**Files:**
- Modify: `src/server.js`

- [ ] Add shared stock filters and render function.
- [ ] Add KPI, product, movement, low-stock, and movement-type datasets.
- [ ] Refactor duplicated movement handlers into one helper.
- [ ] Run `npm run check`.

### Task 3: CSV Exports

**Files:**
- Modify: `src/server.js`

- [ ] Add `/stock/export/:type`.
- [ ] Export product stock and movement history.
- [ ] Run `npm test` and `npm run check`.

### Task 4: View

**Files:**
- Modify: `src/views/stock.ejs`
- Modify: `public/css/app.css` if needed.

- [ ] Add filters, KPI cards, visuals, exports, and clearer tables.
- [ ] Keep movement form functional.
- [ ] Run final verification.
