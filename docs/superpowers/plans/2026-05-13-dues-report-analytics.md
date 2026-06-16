# Dues Report Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/reports/dues` with richer filters, KPIs, CSS diagrams, drilldowns, and CSV exports.

**Architecture:** Add dues report helper functions in `src/services/report-utils.js`, extend the existing `/reports/dues` route in `src/server.js`, add `/reports/dues/export/:type`, and update `src/views/reports/dues.ejs`.

**Tech Stack:** Node.js, Express, EJS, MariaDB, Node built-in test runner, CSS.

---

### Task 1: Helper Tests

**Files:**
- Modify: `test/report-utils.test.js`
- Modify: `src/services/report-utils.js`

- [ ] Add failing tests for `normalizeDuesReportFilters` and `preserveDuesReportQuery`.
- [ ] Implement helper functions.
- [ ] Run `npm test`.

### Task 2: Dues Route Data

**Files:**
- Modify: `src/server.js`

- [ ] Replace raw query handling in `/reports/dues` with normalized dues filters.
- [ ] Add payment method options and filter SQL.
- [ ] Add member status/search filtering for member drilldowns.
- [ ] Add monthly trend, recent payments, collection KPIs, payment method percentages, and outstanding percentages.
- [ ] Run `npm run check`.

### Task 3: Dues CSV Exports

**Files:**
- Modify: `src/server.js`

- [ ] Add `/reports/dues/export/:type`.
- [ ] Export paid members, outstanding balances, unpaid members, payment methods, and monthly trend.
- [ ] Run `npm test` and `npm run check`.

### Task 4: Dues View

**Files:**
- Modify: `src/views/reports/dues.ejs`
- Modify: `public/css/app.css` if needed.

- [ ] Add richer filter controls.
- [ ] Replace summary tables with KPI cards and visual progress sections.
- [ ] Add drilldown panels and export buttons.
- [ ] Verify the template uses only locals provided by the route.

### Task 5: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Review the implementation against the spec.
