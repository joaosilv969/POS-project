# Reports Analytics Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a richer `/reports` analytics workbench with filters, visual summaries, drilldown tables, and CSV exports.

**Architecture:** Add focused report utility modules and keep SQL route orchestration inside `src/server.js` for compatibility with the existing Express/EJS structure. Render a new `src/views/reports/workbench.ejs` using dependency-free CSS charts.

**Tech Stack:** Node.js, Express, EJS, MariaDB, Node built-in test runner, CSS.

---

### Task 1: Report Utility Tests

**Files:**
- Create: `test/report-utils.test.js`
- Create: `src/services/report-utils.js`

- [ ] Write tests for filter normalization, query preservation, chart percentages, and CSV escaping.
- [ ] Run `npm test` and verify the tests fail because `src/services/report-utils.js` does not exist.
- [ ] Implement the utility module.
- [ ] Run `npm test` and verify the tests pass.

### Task 2: Workbench Route

**Files:**
- Modify: `src/server.js`
- Create: `src/views/reports/workbench.ejs`

- [ ] Replace the `/reports` redirect with a workbench route.
- [ ] Add select option queries for payment methods, employees, and categories.
- [ ] Add aggregate queries for KPIs, daily sales, products, employees, payments, categories, and low stock.
- [ ] Render the new workbench view.
- [ ] Run `npm run check`.

### Task 3: CSV Exports

**Files:**
- Modify: `src/server.js`

- [ ] Add `GET /reports/export/:type`.
- [ ] Reuse normalized filters for export queries.
- [ ] Return CSV for `daily`, `products`, `payments`, `employees`, and `categories`.
- [ ] Redirect unknown export types back to `/reports`.
- [ ] Run `npm test` and `npm run check`.

### Task 4: Report UI Styling

**Files:**
- Modify: `public/css/app.css`
- Modify: `src/views/reports/workbench.ejs`

- [ ] Add analytics tabs, compact filter layout, KPI cards, CSS bar charts, and export controls.
- [ ] Ensure mobile layout collapses cleanly.
- [ ] Run `npm run check`.

### Task 5: Final Verification

**Files:**
- No new files.

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Review the implemented requirements against the design spec.
