# Merchandising Report Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/reports/merchandising` with richer analytics, filters, visuals, drilldowns, and CSV exports.

**Architecture:** Add merchandising report helpers, extend the existing route in `src/server.js`, add CSV exports, and update the EJS view using existing CSS chart components.

**Tech Stack:** Node.js, Express, EJS, MariaDB, Node built-in test runner, CSS.

---

### Task 1: Helper Tests

**Files:**
- Modify: `test/report-utils.test.js`
- Modify: `src/services/report-utils.js`

- [ ] Add failing tests for `normalizeMerchReportFilters` and `preserveMerchReportQuery`.
- [ ] Implement helper functions.
- [ ] Run `npm test`.

### Task 2: Route Data

**Files:**
- Modify: `src/server.js`

- [ ] Add normalized filters and SQL fragments.
- [ ] Add KPI, trend, product, member, category, payment, recent sales, and low-stock datasets.
- [ ] Run `npm run check`.

### Task 3: CSV Exports

**Files:**
- Modify: `src/server.js`

- [ ] Add `/reports/merchandising/export/:type`.
- [ ] Export products, members, matrix, daily trend, recent sales, categories, and payment methods.
- [ ] Run checks.

### Task 4: View

**Files:**
- Modify: `src/views/reports/merchandising.ejs`

- [ ] Add filters, KPIs, charts, drilldowns, and export links.
- [ ] Verify all template locals are provided.

### Task 5: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
