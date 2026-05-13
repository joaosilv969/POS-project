const VALID_AREAS = new Set(["all", "bar", "merchandising"]);
const VALID_DUES_STATUSES = new Set(["all", "paid", "partial", "unpaid"]);
const VALID_STOCK_STATUSES = new Set(["all", "ok", "low", "out"]);
const VALID_STOCK_MOVEMENT_TYPES = new Set(["all", "entry", "manual_adjustment", "waste"]);

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function positiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeReportFilters(query = {}) {
  const area = VALID_AREAS.has(query.area) ? query.area : "all";

  return {
    startDate: isDate(query.start_date) ? query.start_date : "",
    endDate: isDate(query.end_date) ? query.end_date : "",
    area,
    paymentMethodId: positiveInteger(query.payment_method_id),
    userId: positiveInteger(query.user_id),
    categoryId: positiveInteger(query.category_id),
  };
}

function preserveReportQuery(filters) {
  const params = new URLSearchParams();

  if (filters.startDate) {
    params.set("start_date", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end_date", filters.endDate);
  }

  if (filters.area && filters.area !== "all") {
    params.set("area", filters.area);
  }

  if (filters.paymentMethodId) {
    params.set("payment_method_id", String(filters.paymentMethodId));
  }

  if (filters.userId) {
    params.set("user_id", String(filters.userId));
  }

  if (filters.categoryId) {
    params.set("category_id", String(filters.categoryId));
  }

  return params.toString();
}

function normalizeDuesReportFilters(query = {}, fallbackYear = new Date().getFullYear()) {
  const year = Number.parseInt(query.year, 10);
  const normalizedYear = Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : fallbackYear;
  const status = VALID_DUES_STATUSES.has(query.status) ? query.status : "all";
  const search = String(query.q || "").trim().slice(0, 120);

  return {
    year: normalizedYear,
    startDate: isDate(query.start_date) ? query.start_date : "",
    endDate: isDate(query.end_date) ? query.end_date : "",
    paymentMethodId: positiveInteger(query.payment_method_id),
    status,
    search,
  };
}

function preserveDuesReportQuery(filters) {
  const params = new URLSearchParams();

  if (filters.year) {
    params.set("year", String(filters.year));
  }

  if (filters.startDate) {
    params.set("start_date", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end_date", filters.endDate);
  }

  if (filters.paymentMethodId) {
    params.set("payment_method_id", String(filters.paymentMethodId));
  }

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.search) {
    params.set("q", filters.search);
  }

  return params.toString();
}

function normalizeStockReportFilters(query = {}, defaults = {}) {
  const forcedArea = VALID_AREAS.has(defaults.area) && defaults.area !== "all" ? defaults.area : null;
  const area = forcedArea || (VALID_AREAS.has(query.area) ? query.area : "all");
  const status = VALID_STOCK_STATUSES.has(query.status) ? query.status : "all";
  const movementType = VALID_STOCK_MOVEMENT_TYPES.has(query.movement_type) ? query.movement_type : "all";
  const search = String(query.q || "").trim().slice(0, 120);

  return {
    area,
    categoryId: positiveInteger(query.category_id),
    status,
    movementType,
    startDate: isDate(query.start_date) ? query.start_date : "",
    endDate: isDate(query.end_date) ? query.end_date : "",
    search,
  };
}

function preserveStockReportQuery(filters) {
  const params = new URLSearchParams();

  if (filters.area && filters.area !== "all") {
    params.set("area", filters.area);
  }

  if (filters.categoryId) {
    params.set("category_id", String(filters.categoryId));
  }

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.movementType && filters.movementType !== "all") {
    params.set("movement_type", filters.movementType);
  }

  if (filters.startDate) {
    params.set("start_date", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end_date", filters.endDate);
  }

  if (filters.search) {
    params.set("q", filters.search);
  }

  return params.toString();
}

function makePercent(value, max) {
  const number = Number(value || 0);
  const maximum = Number(max || 0);

  if (!Number.isFinite(number) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((number / maximum) * 100)));
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function rowsToCsv(columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column.key])).join(","))
    .join("\n");

  return `${header}\n${body}${body ? "\n" : ""}`;
}

module.exports = {
  csvEscape,
  makePercent,
  normalizeDuesReportFilters,
  normalizeReportFilters,
  normalizeStockReportFilters,
  preserveDuesReportQuery,
  preserveReportQuery,
  preserveStockReportQuery,
  rowsToCsv,
};
