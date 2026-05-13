const test = require("node:test");
const assert = require("node:assert/strict");

const {
  csvEscape,
  makePercent,
  normalizeDuesReportFilters,
  normalizeMerchReportFilters,
  normalizeReportFilters,
  normalizeStockReportFilters,
  preserveDuesReportQuery,
  preserveMerchReportQuery,
  preserveReportQuery,
  preserveStockReportQuery,
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

test("normalizeDuesReportFilters keeps valid dues filters", () => {
  const filters = normalizeDuesReportFilters({
    year: "2025",
    start_date: "2025-01-01",
    end_date: "bad",
    payment_method_id: "4",
    status: "partial",
    q: "  joao  ",
  }, 2026);

  assert.deepEqual(filters, {
    year: 2025,
    startDate: "2025-01-01",
    endDate: "",
    paymentMethodId: 4,
    status: "partial",
    search: "joao",
  });
});

test("normalizeDuesReportFilters falls back on invalid dues filters", () => {
  const filters = normalizeDuesReportFilters({
    year: "1800",
    payment_method_id: "x",
    status: "unknown",
    q: "   ",
  }, 2026);

  assert.deepEqual(filters, {
    year: 2026,
    startDate: "",
    endDate: "",
    paymentMethodId: 0,
    status: "all",
    search: "",
  });
});

test("preserveDuesReportQuery serializes active dues filters only", () => {
  const query = preserveDuesReportQuery({
    year: 2025,
    startDate: "2025-01-01",
    endDate: "",
    paymentMethodId: 2,
    status: "paid",
    search: "ana",
  });

  assert.equal(query, "year=2025&start_date=2025-01-01&payment_method_id=2&status=paid&q=ana");
});

test("normalizeStockReportFilters keeps valid stock filters", () => {
  const filters = normalizeStockReportFilters({
    area: "bar",
    category_id: "5",
    status: "low",
    movement_type: "entry",
    start_date: "2026-01-01",
    end_date: "bad",
    q: "  beer  ",
  });

  assert.deepEqual(filters, {
    area: "bar",
    categoryId: 5,
    status: "low",
    movementType: "entry",
    startDate: "2026-01-01",
    endDate: "",
    search: "beer",
  });
});

test("normalizeStockReportFilters falls back on invalid stock filters", () => {
  const filters = normalizeStockReportFilters({
    area: "wrong",
    category_id: "x",
    status: "bad",
    movement_type: "sale",
    q: "   ",
  });

  assert.deepEqual(filters, {
    area: "all",
    categoryId: 0,
    status: "all",
    movementType: "all",
    startDate: "",
    endDate: "",
    search: "",
  });
});

test("preserveStockReportQuery serializes active stock filters only", () => {
  const query = preserveStockReportQuery({
    area: "merchandising",
    categoryId: 8,
    status: "out",
    movementType: "waste",
    startDate: "2026-01-01",
    endDate: "",
    search: "shirt",
  });

  assert.equal(query, "area=merchandising&category_id=8&status=out&movement_type=waste&start_date=2026-01-01&q=shirt");
});

test("normalizeMerchReportFilters keeps valid merchandising filters", () => {
  const filters = normalizeMerchReportFilters({
    start_date: "2026-02-01",
    end_date: "bad",
    category_id: "4",
    payment_method_id: "2",
    user_id: "9",
    member_q: "  ana  ",
    product_q: " shirt ",
  });

  assert.deepEqual(filters, {
    startDate: "2026-02-01",
    endDate: "",
    categoryId: 4,
    paymentMethodId: 2,
    userId: 9,
    memberSearch: "ana",
    productSearch: "shirt",
  });
});

test("normalizeMerchReportFilters falls back on invalid merchandising filters", () => {
  const filters = normalizeMerchReportFilters({
    start_date: "bad",
    category_id: "x",
    payment_method_id: "0",
    user_id: "-1",
    member_q: "   ",
    product_q: "   ",
  });

  assert.deepEqual(filters, {
    startDate: "",
    endDate: "",
    categoryId: 0,
    paymentMethodId: 0,
    userId: 0,
    memberSearch: "",
    productSearch: "",
  });
});

test("preserveMerchReportQuery serializes active merchandising filters only", () => {
  const query = preserveMerchReportQuery({
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    categoryId: 4,
    paymentMethodId: 2,
    userId: 9,
    memberSearch: "ana",
    productSearch: "shirt",
  });

  assert.equal(query, "start_date=2026-02-01&end_date=2026-02-28&category_id=4&payment_method_id=2&user_id=9&member_q=ana&product_q=shirt");
});
