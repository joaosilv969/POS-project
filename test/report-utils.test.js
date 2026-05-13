const test = require("node:test");
const assert = require("node:assert/strict");

const {
  csvEscape,
  makePercent,
  normalizeReportFilters,
  preserveReportQuery,
  rowsToCsv,
} = require("../src/services/report-utils");

test("normalizeReportFilters keeps valid filters and drops invalid values", () => {
  const filters = normalizeReportFilters({
    start_date: "2026-05-01",
    end_date: "bad-date",
    area: "merchandising",
    payment_method_id: "7",
    user_id: "x",
    category_id: "12",
  });

  assert.deepEqual(filters, {
    startDate: "2026-05-01",
    endDate: "",
    area: "merchandising",
    paymentMethodId: 7,
    userId: 0,
    categoryId: 12,
  });
});

test("preserveReportQuery serializes active filters only", () => {
  const query = preserveReportQuery({
    startDate: "2026-05-01",
    endDate: "",
    area: "all",
    paymentMethodId: 3,
    userId: 0,
    categoryId: 9,
  });

  assert.equal(query, "start_date=2026-05-01&payment_method_id=3&category_id=9");
});

test("makePercent returns a bounded percentage", () => {
  assert.equal(makePercent(25, 100), 25);
  assert.equal(makePercent(200, 100), 100);
  assert.equal(makePercent(1, 0), 0);
});

test("csvEscape quotes commas, quotes, and new lines", () => {
  assert.equal(csvEscape('A "quoted", value\nnext'), '"A ""quoted"", value\nnext"');
});

test("rowsToCsv renders headers and escaped values", () => {
  const csv = rowsToCsv(
    [
      { key: "name", label: "Name" },
      { key: "total", label: "Total" },
    ],
    [{ name: "Cash, Card", total: 12.5 }],
  );

  assert.equal(csv, 'Name,Total\n"Cash, Card",12.5\n');
});
